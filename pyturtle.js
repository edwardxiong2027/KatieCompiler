/* pyturtle.js — a pure-Python `turtle` module for Pyodide.
 *
 * Real CPython turtle draws through tkinter, which doesn't exist in the browser.
 * Instead we register a drop-in `turtle` module that records every pen stroke
 * and renders the finished drawing to an SVG string. worker.js (and the inline
 * fallback in runner.js) collect that SVG after a run and show it in the
 * console, just like a matplotlib figure.
 *
 * It implements the common classroom subset of the turtle API: movement,
 * headings, pen/fill colours, circle, dot, stamp, write, and the Screen helpers.
 * GUI/event hooks (onkey, mainloop, tracer…) are accepted as harmless no-ops.
 *
 * Defined as a global string so both the worker (importScripts) and the main
 * thread (a <script> tag) share one source of truth. */

self.KATIE_PY_TURTLE = String.raw`
import sys, types, math

_SCREEN = None
_DEFAULT = None


def _color(screen, *args):
    """Turn a turtle colour spec into an SVG colour string."""
    if len(args) == 1:
        c = args[0]
        if isinstance(c, (tuple, list)):
            args = tuple(c)
        else:
            return str(c)
    if len(args) >= 3:
        r, g, b = args[0], args[1], args[2]
        cm = getattr(screen, 'colormode_', 1.0) or 1.0
        def conv(v):
            v = v * 255.0 if cm == 1.0 else v
            return max(0, min(255, int(round(v))))
        return '#%02x%02x%02x' % (conv(r), conv(g), conv(b))
    return 'black'


class _TurtleScreen:
    def __init__(self):
        self.items = []
        self.bg = 'white'
        self.width = None
        self.height = None
        self.colormode_ = 1.0

    def bgcolor(self, *a):
        if a:
            self.bg = _color(self, *a)
        return self.bg

    def setup(self, width=None, height=None, *a, **k):
        try:
            if width is not None:
                self.width = int(width)
            if height is not None:
                self.height = int(height)
        except (TypeError, ValueError):
            pass

    def screensize(self, canvwidth=None, canvheight=None, *a, **k):
        self.setup(canvwidth, canvheight)

    def setworldcoordinates(self, *a, **k):
        pass

    def colormode(self, *a):
        if a:
            self.colormode_ = a[0]
        return self.colormode_

    def tracer(self, *a, **k):
        return 0

    def reset(self):
        self.items = []

    clear = clearscreen = reset

    def _add(self, item):
        self.items.append(item)

    # GUI / event no-ops so programs that call them still run --------------
    def update(self, *a, **k): pass
    def delay(self, *a, **k): return 0
    def title(self, *a, **k): pass
    def listen(self, *a, **k): pass
    def onkey(self, *a, **k): pass
    def onkeypress(self, *a, **k): pass
    def onkeyrelease(self, *a, **k): pass
    def onclick(self, *a, **k): pass
    def onscreenclick(self, *a, **k): pass
    def ontimer(self, *a, **k): pass
    def bye(self, *a, **k): pass
    def exitonclick(self, *a, **k): pass
    def mainloop(self, *a, **k): pass
    done = mainloop
    def register_shape(self, *a, **k): pass
    addshape = register_shape
    def textinput(self, *a, **k): return ''
    def numinput(self, *a, **k): return None


def Screen():
    global _SCREEN
    if _SCREEN is None:
        _SCREEN = _TurtleScreen()
    return _SCREEN


TurtleScreen = _TurtleScreen


class Turtle:
    def __init__(self, shape='classic', *a, **k):
        self.screen = Screen()
        self._x = 0.0
        self._y = 0.0
        self._angle = 0.0          # degrees, counter-clockwise, 0 = east
        self._down = True
        self._pencolor = 'black'
        self._fillcolor = 'black'
        self._width = 1.0
        self._visible = True
        self._filling = False
        self._fillpoints = []
        self._fillstart = 0
        self._speed = 6
        self._angle_unit = 360.0   # full circle in current units

    # ---- internals -----------------------------------------------------
    def _todeg(self, a):
        return a * 360.0 / self._angle_unit

    def _record_line(self, x0, y0, x1, y1):
        self.screen._add({'type': 'line', 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1,
                          'color': self._pencolor, 'width': self._width})

    def _goto(self, x, y, draw=True):
        if draw and self._down:
            self._record_line(self._x, self._y, x, y)
        if self._filling:
            self._fillpoints.append((x, y))
        self._x, self._y = float(x), float(y)

    # ---- movement ------------------------------------------------------
    def forward(self, dist):
        a = math.radians(self._angle)
        self._goto(self._x + dist * math.cos(a), self._y + dist * math.sin(a))
    fd = forward

    def backward(self, dist):
        self.forward(-dist)
    bk = back = backward

    def right(self, ang):
        self._angle -= self._todeg(ang)
    rt = right

    def left(self, ang):
        self._angle += self._todeg(ang)
    lt = left

    def setheading(self, to_angle):
        self._angle = self._todeg(to_angle)
    seth = setheading

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._goto(x, y)
    setpos = setposition = goto

    def setx(self, x):
        self._goto(x, self._y)

    def sety(self, y):
        self._goto(self._x, y)

    def home(self):
        self._goto(0, 0)
        self._angle = 0.0

    def teleport(self, x=None, y=None, **k):
        self._goto(self._x if x is None else x,
                   self._y if y is None else y, draw=False)

    def circle(self, radius, extent=None, steps=None):
        if extent is None:
            extent = 360.0
        if steps is None:
            steps = max(4, int(abs(extent) / 8) + 1)
        cx = self._x + radius * math.cos(math.radians(self._angle + 90))
        cy = self._y + radius * math.sin(math.radians(self._angle + 90))
        start = math.atan2(self._y - cy, self._x - cx)
        sweep = math.radians(extent) * (1 if radius >= 0 else -1)
        r = abs(radius)
        for i in range(1, steps + 1):
            t = start + sweep * i / steps
            self._goto(cx + r * math.cos(t), cy + r * math.sin(t))
        self._angle += extent if radius >= 0 else -extent

    # ---- pen state -----------------------------------------------------
    def penup(self):
        self._down = False
    pu = up = penup

    def pendown(self):
        self._down = True
    pd = down = pendown

    def isdown(self):
        return self._down

    def pensize(self, width=None):
        if width is None:
            return self._width
        self._width = width
    width = pensize

    def pencolor(self, *a):
        if a:
            self._pencolor = _color(self.screen, *a)
        return self._pencolor

    def fillcolor(self, *a):
        if a:
            self._fillcolor = _color(self.screen, *a)
        return self._fillcolor

    def color(self, *a):
        if not a:
            return (self._pencolor, self._fillcolor)
        if len(a) == 1:
            self._pencolor = self._fillcolor = _color(self.screen, a[0])
        elif len(a) == 2 and not isinstance(a[0], (int, float)):
            self._pencolor = _color(self.screen, a[0])
            self._fillcolor = _color(self.screen, a[1])
        else:
            self._pencolor = self._fillcolor = _color(self.screen, *a)

    # ---- fills ---------------------------------------------------------
    def begin_fill(self):
        self._filling = True
        self._fillpoints = [(self._x, self._y)]
        self._fillstart = len(self.screen.items)

    def end_fill(self):
        if self._filling and len(self._fillpoints) >= 3:
            self.screen.items.insert(self._fillstart,
                {'type': 'poly', 'points': list(self._fillpoints), 'fill': self._fillcolor})
        self._filling = False
        self._fillpoints = []

    # ---- marks ---------------------------------------------------------
    def dot(self, size=None, *color):
        if size is None:
            size = max(self._width + 4, self._width * 2)
        col = _color(self.screen, *color) if color else self._pencolor
        self.screen._add({'type': 'dot', 'x': self._x, 'y': self._y,
                          'r': size / 2.0, 'color': col})

    def stamp(self):
        self.dot(max(8, self._width * 4))
        return 0

    def write(self, text, move=False, align='left', font=('Arial', 8, 'normal')):
        size = font[1] if isinstance(font, (tuple, list)) and len(font) > 1 else 8
        self.screen._add({'type': 'text', 'x': self._x, 'y': self._y,
                          'text': str(text), 'color': self._pencolor,
                          'size': size, 'align': align})

    # ---- queries -------------------------------------------------------
    def position(self):
        return (self._x, self._y)
    pos = position

    def xcor(self):
        return self._x

    def ycor(self):
        return self._y

    def heading(self):
        return (self._angle % 360) * self._angle_unit / 360.0

    def towards(self, x, y=None):
        if y is None:
            x, y = x
        return math.degrees(math.atan2(y - self._y, x - self._x)) % 360

    def distance(self, x, y=None):
        if y is None:
            x, y = x
        return math.hypot(x - self._x, y - self._y)

    # ---- visibility & misc (mostly cosmetic in this renderer) ----------
    def hideturtle(self):
        self._visible = False
    ht = hideturtle

    def showturtle(self):
        self._visible = True
    st = showturtle

    def isvisible(self):
        return self._visible

    def speed(self, *a):
        if a:
            self._speed = a[0]
        return self._speed

    def radians(self):
        self._angle_unit = 2 * math.pi

    def degrees(self, fullcircle=360.0):
        self._angle_unit = fullcircle

    def getscreen(self):
        return self.screen

    def getpen(self):
        return self

    def clear(self, *a, **k): pass
    def reset(self, *a, **k): pass
    def shape(self, *a, **k): pass
    def shapesize(self, *a, **k): pass
    turtlesize = shapesize
    def pen(self, *a, **k): pass
    def clearstamp(self, *a, **k): pass
    def clearstamps(self, *a, **k): pass
    def onclick(self, *a, **k): pass
    def onrelease(self, *a, **k): pass
    def ondrag(self, *a, **k): pass


Pen = RawTurtle = RawPen = Turtle


def _default():
    global _DEFAULT
    if _DEFAULT is None:
        _DEFAULT = Turtle()
    return _DEFAULT


def _esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;')
             .replace('>', '&gt;').replace('"', '&quot;'))


def _render_svg(s):
    items = s.items
    xs, ys = [], []
    for it in items:
        t = it['type']
        if t == 'line':
            xs += [it['x0'], it['x1']]; ys += [it['y0'], it['y1']]
        elif t == 'poly':
            for px, py in it['points']:
                xs.append(px); ys.append(py)
        elif t == 'dot':
            xs += [it['x'] - it['r'], it['x'] + it['r']]
            ys += [it['y'] - it['r'], it['y'] + it['r']]
        elif t == 'text':
            xs.append(it['x']); ys.append(it['y'])
    if not xs:
        xs, ys = [0.0], [0.0]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    if s.width and s.height:
        minx, maxx = -s.width / 2.0, s.width / 2.0
        miny, maxy = -s.height / 2.0, s.height / 2.0
    pad = 20
    minx -= pad; maxx += pad; miny -= pad; maxy += pad
    w = max(maxx - minx, 1.0)
    h = max(maxy - miny, 1.0)

    def X(x):
        return x - minx

    def Y(y):
        return maxy - y   # flip: turtle y points up, SVG y points down

    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g" width="%g" height="%g">'
           % (w, h, w, h),
           '<rect x="0" y="0" width="%g" height="%g" fill="%s"/>' % (w, h, s.bg)]
    for it in items:
        t = it['type']
        if t == 'poly':
            pts = ' '.join('%g,%g' % (X(px), Y(py)) for px, py in it['points'])
            out.append('<polygon points="%s" fill="%s"/>' % (pts, it['fill']))
        elif t == 'line':
            out.append('<line x1="%g" y1="%g" x2="%g" y2="%g" stroke="%s" stroke-width="%g" stroke-linecap="round" stroke-linejoin="round"/>'
                       % (X(it['x0']), Y(it['y0']), X(it['x1']), Y(it['y1']), it['color'], it['width']))
        elif t == 'dot':
            out.append('<circle cx="%g" cy="%g" r="%g" fill="%s"/>'
                       % (X(it['x']), Y(it['y']), it['r'], it['color']))
        elif t == 'text':
            anchor = {'left': 'start', 'center': 'middle', 'right': 'end'}.get(it.get('align', 'left'), 'start')
            out.append('<text x="%g" y="%g" fill="%s" font-size="%g" font-family="Arial, sans-serif" text-anchor="%s">%s</text>'
                       % (X(it['x']), Y(it['y']), it['color'], it['size'], anchor, _esc(it['text'])))
    out.append('</svg>')
    return ''.join(out)


def _katie_reset_turtle():
    global _SCREEN, _DEFAULT
    _SCREEN = None
    _DEFAULT = None


def _katie_collect_turtle():
    if _SCREEN is None or not _SCREEN.items:
        return None
    return _render_svg(_SCREEN)


# ---- module-level functions delegating to the default turtle / screen -----
_PEN_METHODS = [
    'forward', 'fd', 'backward', 'bk', 'back', 'right', 'rt', 'left', 'lt',
    'goto', 'setpos', 'setposition', 'setx', 'sety', 'setheading', 'seth',
    'home', 'teleport', 'circle', 'penup', 'pu', 'up', 'pendown', 'pd', 'down',
    'isdown', 'pensize', 'width', 'pencolor', 'fillcolor', 'color',
    'begin_fill', 'end_fill', 'dot', 'stamp', 'write', 'position', 'pos',
    'xcor', 'ycor', 'heading', 'towards', 'distance', 'hideturtle', 'ht',
    'showturtle', 'st', 'isvisible', 'speed', 'radians', 'degrees',
    'getscreen', 'getpen', 'clear', 'reset', 'shape', 'shapesize', 'pen',
]
_SCREEN_METHODS = [
    'bgcolor', 'setup', 'screensize', 'setworldcoordinates', 'colormode',
    'tracer', 'update', 'delay', 'title', 'listen', 'onkey', 'onkeypress',
    'onscreenclick', 'ontimer', 'bye', 'exitonclick', 'mainloop', 'done',
    'register_shape', 'addshape', 'clearscreen', 'resetscreen', 'textinput',
    'numinput',
]

_mod = types.ModuleType('turtle')
_mod.Turtle = Turtle
_mod.Pen = Pen
_mod.RawTurtle = RawTurtle
_mod.RawPen = RawPen
_mod.Screen = Screen
_mod.TurtleScreen = TurtleScreen
_mod.mainloop = lambda *a, **k: None
_mod.done = _mod.mainloop


def _make_pen_fn(name):
    def fn(*a, **k):
        return getattr(_default(), name)(*a, **k)
    fn.__name__ = name
    return fn


def _make_screen_fn(name):
    def fn(*a, **k):
        return getattr(Screen(), name)(*a, **k)
    fn.__name__ = name
    return fn


for _n in _PEN_METHODS:
    setattr(_mod, _n, _make_pen_fn(_n))
for _n in _SCREEN_METHODS:
    if not hasattr(_mod, _n):
        setattr(_mod, _n, _make_screen_fn(_n))

_mod._katie_collect_turtle = _katie_collect_turtle
_mod._katie_reset_turtle = _katie_reset_turtle
sys.modules['turtle'] = _mod
`;
