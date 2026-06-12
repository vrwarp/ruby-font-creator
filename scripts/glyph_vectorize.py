"""Raster glyph -> vector contour extraction (shared geometry module).

Marching squares with linear interpolation (sub-pixel iso-contours) followed
by corner-aware least-squares cubic Bezier fitting (Schneider, Graphics Gems).
This is the Python twin of src/vectorizer.ts; the browser and the offline
style-faithful pipeline share the same algorithm.

Conventions: scalar field is ink-high in [0,1]; output loops are polylines in
pixel-center coordinates, y-down; outer loops have positive shoelace area,
holes negative (TrueType-correct after a y-flip into font units).

Main entry: image_to_contours(field, iso, ...) -> list of closed polylines.
"""

import math

import numpy as np


def _interp(a, b, iso):
    d = b - a
    return 0.5 if abs(d) < 1e-12 else (iso - a) / d


def marching_squares(field, iso):
    """Returns closed sub-pixel contours (list of [x,y] lists), ink-left
    orientation: outer loops have positive shoelace in y-down coords."""
    f = np.pad(field.astype(np.float64), 1, constant_values=0.0)
    h, w = f.shape
    # crossing point on each edge of each cell, lazily keyed
    segs = {}  # (cy, cx, entry_edge) -> exit_edge

    def corners(cy, cx):
        return f[cy, cx], f[cy, cx + 1], f[cy + 1, cx + 1], f[cy + 1, cx]  # TL TR BR BL

    for cy in range(h - 1):
        for cx in range(w - 1):
            tl, tr, br, bl = corners(cy, cx)
            code = (tl >= iso) * 8 | (tr >= iso) * 4 | (br >= iso) * 2 | (bl >= iso) * 1
            if code in (0, 15):
                continue
            if code in (5, 10):
                center = (tl + tr + br + bl) / 4.0
                pairs = SADDLE_TABLE[(code, center >= iso)]
            else:
                pairs = CASE_TABLE[code]
            for entry, exit_ in pairs:
                segs[(cy, cx, entry)] = exit_

    def edge_point(cy, cx, edge):
        tl, tr, br, bl = corners(cy, cx)
        if edge == 0:
            return (cx + _interp(tl, tr, iso), cy)
        if edge == 1:
            return (cx + 1, cy + _interp(tr, br, iso))
        if edge == 2:
            return (cx + _interp(bl, br, iso), cy + 1)
        return (cx, cy + _interp(tl, bl, iso))

    # neighbor across an exit edge, and the matching entry edge there
    STEP = {0: (0, -1, 2), 1: (1, 0, 3), 2: (0, 1, 0), 3: (-1, 0, 1)}

    contours = []
    visited = set()
    for key in list(segs.keys()):
        if key in visited:
            continue
        loop = []
        k = key
        while k not in visited:
            visited.add(k)
            cy, cx, entry = k
            exit_ = segs[k]
            loop.append(edge_point(cy, cx, exit_))
            dx, dy, nentry = STEP[exit_]
            k = (cy + dy, cx + dx, nentry)
            if k not in segs:
                break  # open contour (shouldn't happen with padding)
        if len(loop) >= 3:
            # un-pad coordinates back to pixel-center space
            contours.append([(x - 1.0, y - 1.0) for x, y in loop])
    return contours


# Static case tables, ink on the RIGHT of travel (y-down screen coords), so
# outer loops have positive shoelace and holes negative. Bits: TL=8 TR=4 BR=2
# BL=1; edges: 0=T 1=R 2=B 3=L. Derived by hand per case; verified by tests.
CASE_TABLE = {
    1: [(3, 2)],
    2: [(2, 1)],
    3: [(3, 1)],
    4: [(1, 0)],
    6: [(2, 0)],
    7: [(3, 0)],
    8: [(0, 3)],
    9: [(0, 2)],
    11: [(0, 1)],
    12: [(1, 3)],
    13: [(1, 2)],
    14: [(2, 3)],
}

SADDLE_TABLE = {
    (5, True): [(3, 0), (1, 2)],
    (5, False): [(3, 2), (1, 0)],
    (10, True): [(0, 1), (2, 3)],
    (10, False): [(0, 3), (2, 1)],
}


# ----------------------------------------------------- contour post-processing


def shoelace(pts):
    s = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def resample(pts, spacing=0.6):
    """Uniform arc-length resampling of a closed polyline."""
    n = len(pts)
    lengths = []
    total = 0.0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        l = math.hypot(x2 - x1, y2 - y1)
        lengths.append(l)
        total += l
    if total < spacing * 3:
        return pts
    m = max(8, int(round(total / spacing)))
    step = total / m
    out = []
    acc = 0.0
    i = 0
    carried = 0.0
    target = 0.0
    for k in range(m):
        target = k * step
        while acc + lengths[i] < target:
            acc += lengths[i]
            i = (i + 1) % n
        t = (target - acc) / lengths[i] if lengths[i] > 0 else 0
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        out.append((x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))
    return out


def detect_corners(pts, angle_deg=55.0, support=2):
    """Indices of corner vertices on a closed resampled polyline."""
    n = len(pts)
    corners = []
    cos_thresh = math.cos(math.radians(angle_deg))
    for i in range(n):
        p0 = pts[(i - support) % n]
        p1 = pts[i]
        p2 = pts[(i + support) % n]
        v1 = (p1[0] - p0[0], p1[1] - p0[1])
        v2 = (p2[0] - p1[0], p2[1] - p1[1])
        l1 = math.hypot(*v1)
        l2 = math.hypot(*v2)
        if l1 < 1e-9 or l2 < 1e-9:
            continue
        cosang = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)
        if cosang < cos_thresh:
            corners.append(i)
    # non-maximum suppression: keep sharpest in runs of adjacent corners
    if not corners:
        return []
    def sharpness(i):
        p0 = pts[(i - support) % n]
        p1 = pts[i]
        p2 = pts[(i + support) % n]
        v1 = (p1[0] - p0[0], p1[1] - p0[1])
        v2 = (p2[0] - p1[0], p2[1] - p1[1])
        l1 = math.hypot(*v1) or 1e-9
        l2 = math.hypot(*v2) or 1e-9
        return -((v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2))
    keep = []
    used = set()
    for i in sorted(corners, key=sharpness, reverse=True):
        if any(abs((i - j) % n) <= support or abs((j - i) % n) <= support for j in keep):
            continue
        keep.append(i)
    return sorted(keep)


# Schneider curve fitting (Graphics Gems "FitCurve"), adapted for our use.


def fit_cubic(pts, t_hat1, t_hat2, error):
    """Fit cubic beziers to OPEN polyline pts; returns list of beziers
    [p0, c1, c2, p3]."""
    if len(pts) == 2:
        d = math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) / 3.0
        return [[pts[0],
                 (pts[0][0] + t_hat1[0] * d, pts[0][1] + t_hat1[1] * d),
                 (pts[1][0] + t_hat2[0] * d, pts[1][1] + t_hat2[1] * d),
                 pts[1]]]
    u = chord_length_param(pts)
    bez = generate_bezier(pts, u, t_hat1, t_hat2)
    max_err, split = compute_max_error(pts, bez, u)
    if max_err < error:
        return [bez]
    if max_err < error * 4:
        for _ in range(4):
            u = reparameterize(pts, u, bez)
            bez = generate_bezier(pts, u, t_hat1, t_hat2)
            max_err, split = compute_max_error(pts, bez, u)
            if max_err < error:
                return [bez]
    # split at max error point
    center_tan = center_tangent(pts, split)
    left = fit_cubic(pts[: split + 1], t_hat1, center_tan, error)
    right = fit_cubic(pts[split:], (-center_tan[0], -center_tan[1]), t_hat2, error)
    return left + right


def chord_length_param(pts):
    u = [0.0]
    for i in range(1, len(pts)):
        u.append(u[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    total = u[-1] or 1.0
    return [x / total for x in u]


def bezier_point(bez, t):
    mt = 1 - t
    return (
        mt**3 * bez[0][0] + 3 * mt**2 * t * bez[1][0] + 3 * mt * t**2 * bez[2][0] + t**3 * bez[3][0],
        mt**3 * bez[0][1] + 3 * mt**2 * t * bez[1][1] + 3 * mt * t**2 * bez[2][1] + t**3 * bez[3][1],
    )


def generate_bezier(pts, u, t_hat1, t_hat2):
    n = len(pts)
    A = []
    for i in range(n):
        t = u[i]
        b1 = 3 * t * (1 - t) ** 2
        b2 = 3 * t**2 * (1 - t)
        A.append(((t_hat1[0] * b1, t_hat1[1] * b1), (t_hat2[0] * b2, t_hat2[1] * b2)))
    C = [[0.0, 0.0], [0.0, 0.0]]
    X = [0.0, 0.0]
    first, last = pts[0], pts[-1]
    for i in range(n):
        t = u[i]
        b0 = (1 - t) ** 3
        b1 = 3 * t * (1 - t) ** 2
        b2 = 3 * t**2 * (1 - t)
        b3 = t**3
        base = (
            first[0] * (b0 + b1) + last[0] * (b2 + b3),
            first[1] * (b0 + b1) + last[1] * (b2 + b3),
        )
        tmp = (pts[i][0] - base[0], pts[i][1] - base[1])
        a1, a2 = A[i]
        C[0][0] += a1[0] * a1[0] + a1[1] * a1[1]
        C[0][1] += a1[0] * a2[0] + a1[1] * a2[1]
        C[1][1] += a2[0] * a2[0] + a2[1] * a2[1]
        X[0] += a1[0] * tmp[0] + a1[1] * tmp[1]
        X[1] += a2[0] * tmp[0] + a2[1] * tmp[1]
    C[1][0] = C[0][1]
    det_C = C[0][0] * C[1][1] - C[1][0] * C[0][1]
    det_X1 = C[0][0] * X[1] - C[1][0] * X[0]
    det_X0 = X[0] * C[1][1] - X[1] * C[0][1]
    alpha_l = 0.0 if abs(det_C) < 1e-12 else det_X0 / det_C
    alpha_r = 0.0 if abs(det_C) < 1e-12 else det_X1 / det_C
    seg_len = math.hypot(last[0] - first[0], last[1] - first[1])
    eps = 1e-6 * seg_len
    if alpha_l < eps or alpha_r < eps:
        alpha_l = alpha_r = seg_len / 3.0
    return [
        first,
        (first[0] + t_hat1[0] * alpha_l, first[1] + t_hat1[1] * alpha_l),
        (last[0] + t_hat2[0] * alpha_r, last[1] + t_hat2[1] * alpha_r),
        last,
    ]


def reparameterize(pts, u, bez):
    return [newton_raphson(bez, pts[i], u[i]) for i in range(len(pts))]


def newton_raphson(bez, p, u):
    d = bezier_point(bez, u)
    dx, dy = d[0] - p[0], d[1] - p[1]
    # derivatives
    q1 = [(3 * (bez[i + 1][0] - bez[i][0]), 3 * (bez[i + 1][1] - bez[i][1])) for i in range(3)]
    q2 = [(2 * (q1[i + 1][0] - q1[i][0]), 2 * (q1[i + 1][1] - q1[i][1])) for i in range(2)]
    mt = 1 - u
    d1 = (
        mt**2 * q1[0][0] + 2 * mt * u * q1[1][0] + u**2 * q1[2][0],
        mt**2 * q1[0][1] + 2 * mt * u * q1[1][1] + u**2 * q1[2][1],
    )
    d2 = (mt * q2[0][0] + u * q2[1][0], mt * q2[0][1] + u * q2[1][1])
    num = dx * d1[0] + dy * d1[1]
    den = d1[0] ** 2 + d1[1] ** 2 + dx * d2[0] + dy * d2[1]
    return u if abs(den) < 1e-12 else min(1.0, max(0.0, u - num / den))


def compute_max_error(pts, bez, u):
    max_err = 0.0
    split = len(pts) // 2
    for i in range(1, len(pts) - 1):
        p = bezier_point(bez, u[i])
        err = (p[0] - pts[i][0]) ** 2 + (p[1] - pts[i][1]) ** 2
        if err > max_err:
            max_err = err
            split = i
    return math.sqrt(max_err), split


def center_tangent(pts, i):
    # backward-pointing tangent at a split (Graphics Gems FitCurve convention)
    v = (pts[i - 1][0] - pts[i + 1][0], pts[i - 1][1] - pts[i + 1][1])
    l = math.hypot(*v) or 1e-9
    return (v[0] / l, v[1] / l)


def unit(v):
    l = math.hypot(*v) or 1e-9
    return (v[0] / l, v[1] / l)


def fit_contour(pts, corners, error=0.4, hv_snap=False):
    """Closed polyline + corner indices -> list of path segments.
    Each segment: ('C', p0, c1, c2, p3) or ('L', p0, p1)."""
    n = len(pts)
    segments = []
    if not corners:
        # closed smooth loop: pick two artificial break points for fitting
        corners = [0, n // 2]
        closed_smooth = True
    else:
        closed_smooth = False
    spans = []
    if len(corners) == 1:
        a = corners[0]
        spans.append((a, a, [pts[(a + j) % n] for j in range(n + 1)]))
    else:
        for ci in range(len(corners)):
            a = corners[ci]
            b = corners[(ci + 1) % len(corners)]
            length = (b - a) % n
            spans.append((a, b, [pts[(a + j) % n] for j in range(length + 1)]))
    for a, b, span in spans:
        if len(span) < 2:
            continue
        chord = (span[-1][0] - span[0][0], span[-1][1] - span[0][1])
        chord_len = math.hypot(*chord)
        max_dev = 0.0
        for p in span:
            # distance to chord
            if chord_len < 1e-9:
                break
            t = ((p[0] - span[0][0]) * chord[0] + (p[1] - span[0][1]) * chord[1]) / chord_len**2
            t = min(1.0, max(0.0, t))
            qx = span[0][0] + chord[0] * t
            qy = span[0][1] + chord[1] * t
            max_dev = max(max_dev, math.hypot(p[0] - qx, p[1] - qy))
        if max_dev < error * 0.75 and chord_len > 0:
            p0, p1 = span[0], span[-1]
            if hv_snap and chord_len > 3.0:
                ang = abs(math.degrees(math.atan2(chord[1], chord[0]))) % 180
                if ang < 4 or ang > 176:  # horizontal
                    ymid = (p0[1] + p1[1]) / 2
                    p0, p1 = (p0[0], ymid), (p1[0], ymid)
                elif abs(ang - 90) < 4:  # vertical
                    xmid = (p0[0] + p1[0]) / 2
                    p0, p1 = (xmid, p0[1]), (xmid, p1[1])
            segments.append(("L", p0, p1))
            continue
        t1 = unit((span[1][0] - span[0][0], span[1][1] - span[0][1]))
        t2 = unit((span[-2][0] - span[-1][0], span[-2][1] - span[-1][1]))
        for bez in fit_cubic(span, t1, t2, error):
            segments.append(("C", bez[0], bez[1], bez[2], bez[3]))
    return segments


def segments_to_polyline(segments, steps=24):
    pts = []
    for seg in segments:
        if seg[0] == "L":
            pts.append(seg[1])
        else:
            bez = seg[1:]
            for k in range(steps):
                pts.append(bezier_point(bez, k / steps))
    return pts


# --------------------------------------------------------------- pipelines


def pipeline_ms(field, iso, fit=False, hv=False, error=0.4, min_area=2.0):
    loops = marching_squares(field, iso)
    loops = [l for l in loops if abs(shoelace(l)) >= min_area]
    out = []
    for loop in loops:
        rs = resample(loop, 0.6)
        if fit:
            corners = detect_corners(rs, 55.0, max(2, int(round(1.5 / 0.6))))
            segs = fit_contour(rs, corners, error=error, hv_snap=hv)
            out.append(segments_to_polyline(segs))
        else:
            out.append(rs)
    return out




def image_to_contours(field, iso=0.5, fit=True, error=0.4, min_area=8.0):
    """Vectorizes a 2-D ink-high [0,1] field into closed polyline contours.

    min_area default is tuned for 256x256 rasters (speckle floor scales with
    resolution; use ~2.0 for 128x128 inputs).
    """
    return pipeline_ms(np.asarray(field, dtype=np.float64), iso, fit=fit, error=error, min_area=min_area)
