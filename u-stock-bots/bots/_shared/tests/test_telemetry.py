from __future__ import annotations

from bots._shared.telemetry import inc, one_line


def test_inc_and_one_line():
    c = {}
    inc(c, "a")
    inc(c, "a", 2)
    inc(c, "b", 5)
    assert c["a"] == 3
    assert c["b"] == 5

    s = one_line("test", c)
    assert s.startswith("[test]")
    assert "a=3" in s
    assert "b=5" in s
