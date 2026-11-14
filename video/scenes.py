from manim import *
from scenekit import *

LINE = "#2E332F"


def code(s, size=22, color=PRIMARY, **kw):
    esc = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return MarkupText(f'<span font_features="calt 0, liga 0">{esc}</span>', font=MONO, font_size=size, color=color, **kw)


def square(size=0.2, color=LINE, opacity=0.35):
    sq = RoundedRectangle(corner_radius=0.03, width=size, height=size, color=color, stroke_width=1.5)
    return sq.set_fill(color, opacity=opacity)


def grid(rows=8, cols=25, size=0.2, buff=0.06):
    return VGroup(*[square(size) for _ in range(rows * cols)]).arrange_in_grid(rows=rows, cols=cols, buff=buff)


def paint(sq, color, opacity=0.45):
    return sq.animate.set_stroke(color).set_fill(color, opacity=opacity)


def bar(width, color, height=0.34):
    b = Rectangle(width=max(width, 0.04), height=height, color=color, stroke_width=0)
    return b.set_fill(color, opacity=0.8)


# One square stands for 10 tests: 200 squares, 2 of them failed.
FAILED = (47, 131)


class S1Result(Timed):
    def construct(self):
        title = code("reporter: [['json', { onlyFailures: true }]]", 22, DIM).to_edge(UP, buff=0.7)
        self.add(title)
        hook = VGroup(
            txt("Playwright's new onlyFailures option", 40),
            code("a 95% smaller report that says 0 passed", 26, ACCENT),
        ).arrange(DOWN, buff=0.45).move_to([0, 0.3, 0])
        self.play(FadeIn(hook[0], shift=UP * 0.2), run_time=0.5)
        self.at("it can shrink")
        self.play(FadeIn(hook[1], shift=UP * 0.15), run_time=0.4)
        first = self.cue("two thousand tests")
        self.cursor = 0
        self.wait(first - 0.6 - self.now())
        self.play(FadeOut(hook), run_time=0.35)

        tests = grid().move_to([0, 1.2, 0])
        lab = code("2,000 tests", 22, DIM).next_to(tests, UP, buff=0.25).align_to(tests, LEFT)
        self.at("two thousand tests")
        self.play(FadeIn(lab), LaggedStart(*[FadeIn(sq, scale=0.6) for sq in tests], lag_ratio=0.004), run_time=0.7)
        fail_lab = code("20 failed", 22, BAD).next_to(tests, UP, buff=0.25).align_to(tests, RIGHT)
        self.at("twenty of them")
        self.play(*[paint(tests[i], BAD, 0.8) for i in FAILED], FadeIn(fail_lab), run_time=0.5)
        full = code("full report   3.05 MB", 30).move_to([-3.6, -1.1, 0], aligned_edge=LEFT)
        only = code("onlyFailures  158 KB", 30, GOOD).move_to([-3.6, -1.8, 0], aligned_edge=LEFT)
        self.at("the full report")
        self.play(FadeIn(full, shift=RIGHT * 0.15), run_time=0.4)
        self.at("with only failures")
        self.play(FadeIn(only, shift=RIGHT * 0.15), *[sq.animate.set_opacity(0.25) for i, sq in enumerate(tests) if i not in FAILED], run_time=0.5)
        tease = VGroup(txt("what you save", 30), code("·", 26, DIM), txt("what you lose", 30, ACCENT)).arrange(RIGHT, buff=0.3)
        tease.move_to([0, -3.0, 0])
        self.at("here is what")
        self.play(FadeIn(tease, shift=UP * 0.15), run_time=0.4)
        self.end()


class S2Setup(Timed):
    def construct(self):
        title = code("the experiment", 22, DIM).to_edge(UP, buff=0.7)
        self.add(title)
        tests = grid(size=0.13, buff=0.04).move_to([-3.6, 1.6, 0])
        lab = code("2,000 tests, no browser", 20, DIM).next_to(tests, DOWN, buff=0.25)
        self.play(LaggedStart(*[FadeIn(sq, scale=0.6) for sq in tests], lag_ratio=0.004), FadeIn(lab), run_time=0.7)
        fails = code("failed   0   20   100   400", 24).move_to([-0.6, 1.6, 0], aligned_edge=LEFT)
        self.at("i made zero")
        self.play(FadeIn(fails, shift=RIGHT * 0.15), run_time=0.4)
        formats = VGroup(*[card(n, NOTE, w=1.9, h=0.75, size=26) for n in ("JSON", "JUnit", "HTML")]).arrange(RIGHT, buff=0.4)
        formats.move_to([-2.6, -0.4, 0])
        self.at("one of three formats")
        self.play(LaggedStart(*[FadeIn(c, shift=UP * 0.15) for c in formats], lag_ratio=0.15), run_time=0.6)
        off = code("onlyFailures: false", 22, DIM).move_to([1.6, -0.1, 0], aligned_edge=LEFT)
        on = code("onlyFailures: true", 22, GOOD).move_to([1.6, -0.7, 0], aligned_edge=LEFT)
        self.at("with the option off")
        self.play(FadeIn(off, shift=RIGHT * 0.15), run_time=0.35)
        self.at("with the option on")
        self.play(FadeIn(on, shift=RIGHT * 0.15), run_time=0.35)
        total = code("160 runs", 64, PRIMARY).move_to([0, -2.2, 0])
        note = code("report size and run time of every run recorded", 22, DIM).next_to(total, DOWN, buff=0.3)
        self.at("one hundred and sixty")
        self.play(FadeIn(total, shift=UP * 0.2), run_time=0.5)
        self.at("i recorded")
        self.play(FadeIn(note), run_time=0.4)
        self.end()


class S3Size(Timed):
    def construct(self):
        title = code("report size  ·  20 of 2,000 tests failed", 22, DIM).to_edge(UP, buff=0.7)
        self.add(title)
        lx, bx, scale = -5.6, -3.9, 6.0 / 3047
        data = [("JSON", 3047, 158, "3.05 MB", "158 KB", 1.7), ("JUnit", 250, 34, "250 KB", "34 KB", 0.2), ("HTML", 964, 599, "964 KB", "599 KB", -1.3)]
        rows = []
        for name, full, only, ftxt, otxt, y in data:
            lab = code(name, 26).move_to([lx, y, 0], aligned_edge=LEFT)
            fb = bar(full * scale, DIM).move_to([bx, y + 0.24, 0], aligned_edge=LEFT)
            ob = bar(only * scale, GOOD).move_to([bx, y - 0.24, 0], aligned_edge=LEFT)
            ft = code(ftxt, 20, DIM).next_to(fb, RIGHT, buff=0.2)
            ot = code(otxt, 20, GOOD).next_to(ob, RIGHT, buff=0.2)
            rows.append((lab, fb, ob, ft, ot))

        def show(row, a, b):
            lab, fb, ob, ft, ot = row
            self.at(a)
            self.play(FadeIn(lab), GrowFromEdge(fb, LEFT), FadeIn(ft), run_time=0.5)
            self.at(b)
            self.play(GrowFromEdge(ob, LEFT), FadeIn(ot), run_time=0.5)

        show(rows[0], "the first format", "to one hundred and fifty eight")
        show(rows[1], "the second drops", "to thirty four")
        show(rows[2], "the web page report", "to five hundred")
        why = code("the viewer app is inside the file", 20, ACCENT).move_to([bx, -2.0, 0], aligned_edge=LEFT)
        self.at("the viewer app")
        self.play(FadeIn(why, shift=UP * 0.1), run_time=0.4)
        time = code("run time: no consistent difference", 26, PRIMARY).move_to([lx, -2.9, 0], aligned_edge=LEFT)
        self.at("and the run")
        self.play(FadeIn(time, shift=UP * 0.15), run_time=0.4)
        self.end()


class S4Kept(Timed):
    def construct(self):
        title = code("what counts as a failure", 22, DIM).to_edge(UP, buff=0.7)
        self.add(title)
        lx = -4.6
        kept = [("fails", "tests that fail"), ("times out", "tests that time"), ("passes on a retry (flaky)", "flaky tests")]
        head = code("kept", 22, GOOD).move_to([lx, 2.0, 0], aligned_edge=LEFT)
        self.play(FadeIn(head), run_time=0.3)
        for i, (label, cue) in enumerate(kept):
            row = code(f"✓  {label}", 28, GOOD).move_to([lx, 1.3 - i * 0.7, 0], aligned_edge=LEFT)
            self.at(cue)
            self.play(FadeIn(row, shift=RIGHT * 0.15), run_time=0.35)
        head2 = code("dropped", 22, DIM).move_to([lx, -1.1, 0], aligned_edge=LEFT)
        d1 = code("×  passes", 28, DIM).move_to([lx, -1.8, 0], aligned_edge=LEFT)
        d2 = code("×  is skipped", 28, DIM).move_to([lx, -2.5, 0], aligned_edge=LEFT)
        self.at("passed tests")
        self.play(FadeIn(head2), FadeIn(d1, shift=RIGHT * 0.15), run_time=0.35)
        self.at("skipped tests")
        self.play(FadeIn(d2, shift=RIGHT * 0.15), run_time=0.35)
        self.end()


class S5Totals(Timed):
    def construct(self):
        title = code("the catch  ·  same run, 20 of 2,000 failed", 22, DIM).to_edge(UP, buff=0.7)
        self.add(title)
        lx, fx, ox = -5.6, -0.6, 3.0
        catch = txt("The totals shrink with the report", 34, ACCENT).move_to([lx, 2.1, 0], aligned_edge=LEFT)
        self.at("the totals shrink")
        self.play(FadeIn(catch, shift=UP * 0.15), run_time=0.4)
        heads = VGroup(code("full", 22, DIM).move_to([fx, 1.1, 0], aligned_edge=LEFT), code("onlyFailures", 22, GOOD).move_to([ox, 1.1, 0], aligned_edge=LEFT))
        rows = [("tests passed", "1,980", "0", 0.3), ("test count", "2,000", "20", -0.6), ("tests with timings", "1,980", "0", -1.5)]
        cells = []
        for name, full, only, y in rows:
            cells.append((
                code(name, 26).move_to([lx, y, 0], aligned_edge=LEFT),
                code(full, 30, PRIMARY).move_to([fx, y, 0], aligned_edge=LEFT),
                code(only, 30, BAD).move_to([ox, y, 0], aligned_edge=LEFT),
            ))
        self.at("in the full report")
        self.play(FadeIn(heads), FadeIn(cells[0][0]), FadeIn(cells[0][1]), run_time=0.4)
        self.at("zero passed")
        self.play(FadeIn(cells[0][2], scale=1.2), run_time=0.4)
        self.at("the test count")
        self.play(FadeIn(cells[1][0]), FadeIn(cells[1][1]), run_time=0.35)
        self.at("twenty not")
        self.play(FadeIn(cells[1][2], scale=1.2), run_time=0.35)
        self.at("and a tool")
        self.play(FadeIn(cells[2][0]), FadeIn(cells[2][1]), run_time=0.35)
        self.at("zero tests")
        self.play(FadeIn(cells[2][2], scale=1.2), run_time=0.35)
        note = code("timings read by playwright-shard-balancer update", 18, DIM).move_to([lx, -2.5, 0], aligned_edge=LEFT)
        self.play(FadeIn(note), run_time=0.3)
        self.end()


class S6Fix(Timed):
    def construct(self):
        title = code("when to use it", 22, DIM).to_edge(UP, buff=0.7)
        self.add(title)
        lx = -5.6
        a = code("✓  the report a person opens after a red run", 26, GOOD).move_to([lx, 1.9, 0], aligned_edge=LEFT)
        b = code("×  dashboards and pass-rate checks", 26, BAD).move_to([lx, 1.1, 0], aligned_edge=LEFT)
        self.at("so use only")
        self.play(FadeIn(a, shift=RIGHT * 0.15), run_time=0.4)
        self.at("do not point")
        self.play(FadeIn(b, shift=RIGHT * 0.15), run_time=0.4)
        blob = card("blob reports", NOTE, w=2.8, h=0.8, size=24).move_to([-4.0, -0.7, 0])
        full = card("full report", DIM, w=3.4, h=0.7, size=22).move_to([1.6, -0.2, 0])
        only = card("onlyFailures report", GOOD, w=3.4, h=0.7, size=22).move_to([1.6, -1.2, 0])
        a1 = arrow(blob.get_right(), full.get_left())
        a2 = arrow(blob.get_right(), only.get_left())
        self.at("write blob reports")
        self.play(FadeIn(blob, shift=UP * 0.15), run_time=0.4)
        self.at("once in full")
        self.play(grow_arrow(a1), FadeIn(full), run_time=0.4)
        self.at("once with only")
        self.play(grow_arrow(a2), FadeIn(only), run_time=0.4)
        caveat = code("caveat: no browser, no attachments. Measure your own reports.", 22, ACCENT).move_to([lx, -2.7, 0], aligned_edge=LEFT)
        self.at("one caveat")
        self.play(FadeIn(caveat, shift=UP * 0.1), run_time=0.4)
        self.end()


class S7EndCard(Timed):
    DRIFT = 0

    def construct(self):
        # Right half stays empty for YouTube's end-screen elements
        brand = VGroup(Dot(radius=0.1, color=GOOD), code("gary-parker", 24, GOOD)).arrange(RIGHT, buff=0.2)
        brand.move_to([-6.1, 3.0, 0], aligned_edge=LEFT)
        rows = VGroup()
        for key, value in [
            ("SOURCE", "github.com/qa-gary-parker/\npoc-playwright-reporter-size"),
            ("WRITE-UP", "garyparker.dev/blog/\nplaywright-165-only-failures"),
        ]:
            rows.add(VGroup(code(key, 16, DIM), code(value, 24, line_spacing=0.8)).arrange(DOWN, buff=0.18, aligned_edge=LEFT))
        rows.arrange(DOWN, buff=0.6, aligned_edge=LEFT).next_to(brand, DOWN, buff=0.9).align_to(brand, LEFT)
        summary = code("onlyFailures: 3.05 MB to 158 KB, 0 passed", 20, DIM).move_to([-6.1, -3.0, 0], aligned_edge=LEFT)
        self.add(brand, rows, summary)
        self.end(minimum=10.0)
