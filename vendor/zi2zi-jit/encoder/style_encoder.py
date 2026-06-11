import functools

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.nn import init


def proj(x, y):
    return torch.mm(y, x.t()) * y / torch.mm(y, y.t())


def gram_schmidt(x, ys):
    for y in ys:
        x = x - proj(x, y)
    return x


def power_iteration(W, u_, update=True, eps=1e-12):
    us, vs, svs = [], [], []
    for i, u in enumerate(u_):
        with torch.no_grad():
            v = torch.matmul(u, W)
            v = F.normalize(gram_schmidt(v, vs), eps=eps)
            vs += [v]
            u = torch.matmul(v, W.t())
            u = F.normalize(gram_schmidt(u, us), eps=eps)
            us += [u]
            if update:
                u_[i][:] = u
        svs += [torch.squeeze(torch.matmul(torch.matmul(v, W.t()), u.t()))]
    return svs, us, vs


class SN:
    def __init__(self, num_svs, num_itrs, num_outputs, transpose=False, eps=1e-12):
        self.num_itrs = num_itrs
        self.num_svs = num_svs
        self.transpose = transpose
        self.eps = eps
        for i in range(self.num_svs):
            self.register_buffer('u%d' % i, torch.randn(1, num_outputs))
            self.register_buffer('sv%d' % i, torch.ones(1))

    @property
    def u(self):
        return [getattr(self, 'u%d' % i) for i in range(self.num_svs)]

    @property
    def sv(self):
        return [getattr(self, 'sv%d' % i) for i in range(self.num_svs)]

    def W_(self):
        W_mat = self.weight.view(self.weight.size(0), -1)
        if self.transpose:
            W_mat = W_mat.t()
        for _ in range(self.num_itrs):
            svs, us, vs = power_iteration(W_mat, self.u, update=self.training, eps=self.eps)
        if self.training:
            with torch.no_grad():
                for i, sv in enumerate(svs):
                    self.sv[i][:] = sv
        return self.weight / svs[0]


class SNConv2d(nn.Conv2d, SN):
    def __init__(
        self,
        in_channels,
        out_channels,
        kernel_size,
        stride=1,
        padding=0,
        dilation=1,
        groups=1,
        bias=True,
        num_svs=1,
        num_itrs=1,
        eps=1e-12,
    ):
        nn.Conv2d.__init__(
            self, in_channels, out_channels, kernel_size, stride, padding, dilation, groups, bias
        )
        SN.__init__(self, num_svs, num_itrs, out_channels, eps=eps)

    def forward(self, x):
        return F.conv2d(x, self.W_(), self.bias, self.stride, self.padding, self.dilation, self.groups)


class DBlock(nn.Module):
    def __init__(
        self,
        in_channels,
        out_channels,
        which_conv=SNConv2d,
        wide=True,
        preactivation=False,
        activation=None,
        downsample=None,
    ):
        super().__init__()

        self.in_channels = in_channels
        self.out_channels = out_channels
        self.hidden_channels = out_channels if wide else in_channels
        self.preactivation = preactivation
        self.activation = activation
        self.downsample = downsample

        self.conv1 = which_conv(in_channels, self.hidden_channels)
        self.conv2 = which_conv(self.hidden_channels, out_channels)
        self.learnable_sc = (in_channels != out_channels) or downsample
        if self.learnable_sc:
            self.conv_sc = which_conv(in_channels, out_channels, kernel_size=1, padding=0)

    def shortcut(self, x):
        if self.preactivation:
            if self.learnable_sc:
                x = self.conv_sc(x)
            if self.downsample:
                x = self.downsample(x)
        else:
            if self.downsample:
                x = self.downsample(x)
            if self.learnable_sc:
                x = self.conv_sc(x)
        return x

    def forward(self, x):
        if self.preactivation:
            h = F.relu(x)
        else:
            h = x
        h = self.conv1(h)
        h = self.conv2(self.activation(h))
        if self.downsample:
            h = self.downsample(h)
        return h + self.shortcut(x)


class StyleEncoder(nn.Module):
    """
    Style encoder for extracting global style embeddings from 128x128 images.

    Architecture:
        - 5 DBlocks with spectral normalization, each halving spatial resolution
        - Channel progression: 3 -> 64 -> 128 -> 256 -> 512 -> 1024
        - Spatial progression: 128 -> 64 -> 32 -> 16 -> 8 -> 4
        - Final: AdaptiveAvgPool -> Linear

    Args:
        hidden_size: Output embedding dimension
        input_nc: Number of input channels (default: 3)
        base_channels: Base channel multiplier (default: 64)

    Example:
        >>> encoder = StyleEncoder(hidden_size=512)
        >>> x = torch.randn(4, 3, 128, 128)
        >>> embedding = encoder(x)  # (4, 512)
    """

    def __init__(
        self,
        hidden_size: int = 512,
        input_nc: int = 3,
        base_channels: int = 64,
    ):
        super().__init__()

        self.hidden_size = hidden_size
        ch = base_channels

        # Channel config for 128 resolution (5 blocks)
        in_channels = [input_nc, ch, ch * 2, ch * 4, ch * 8]
        out_channels = [ch, ch * 2, ch * 4, ch * 8, ch * 16]

        activation = nn.ReLU(inplace=False)

        which_conv = functools.partial(
            SNConv2d,
            kernel_size=3,
            padding=1,
            num_svs=1,
            num_itrs=1,
            eps=1e-12,
        )

        # Build encoder blocks
        self.blocks = nn.ModuleList()
        for i in range(len(out_channels)):
            self.blocks.append(
                DBlock(
                    in_channels=in_channels[i],
                    out_channels=out_channels[i],
                    which_conv=which_conv,
                    wide=True,
                    activation=activation,
                    preactivation=(i > 0),
                    downsample=nn.AvgPool2d(2),
                )
            )

        # Final projection
        final_channels = out_channels[-1]  # 1024
        self.proj = nn.Linear(final_channels, hidden_size)

        self._init_weights()

    def _init_weights(self):
        for module in self.modules():
            if isinstance(module, (nn.Conv2d, nn.Linear)):
                init.normal_(module.weight, 0, 0.02)
                if module.bias is not None:
                    init.zeros_(module.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Input images of shape (B, 3, 128, 128)

        Returns:
            Style embedding of shape (B, hidden_size)
        """
        h = x
        for block in self.blocks:
            h = block(h)

        h = F.adaptive_avg_pool2d(h, (1, 1))
        h = h.view(h.size(0), -1)
        h = self.proj(h)

        return h


if __name__ == "__main__":
    encoder = StyleEncoder(hidden_size=512)
    x = torch.randn(2, 3, 128, 128)
    out = encoder(x)
    print(f"Input shape: {x.shape}")
    print(f"Output shape: {out.shape}")

    total_params = sum(p.numel() for p in encoder.parameters())
    print(f"Total parameters: {total_params:,}")
