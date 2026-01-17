from __future__ import annotations

import time
from typing import Optional, Tuple


def _local_hhmm(epoch: Optional[float] = None) -> Tuple[int, int]:
    t = time.localtime(epoch or time.time())
    return t.tm_hour, t.tm_min


def is_trade_window_local(
    epoch: Optional[float] = None,
    *,
    start_1=(9, 35),
    end_1=(11, 15),
    start_2=(13, 30),
    end_2=(15, 45),
) -> bool:
    """
    Simple time window gate assuming the machine is set to ET.
    If your box is UTC, we’ll swap to timezone-aware later.
    """
    h, m = _local_hhmm(epoch)
    mins = h * 60 + m

    s1 = start_1[0] * 60 + start_1[1]
    e1 = end_1[0] * 60 + end_1[1]
    s2 = start_2[0] * 60 + start_2[1]
    e2 = end_2[0] * 60 + end_2[1]

    return (s1 <= mins <= e1) or (s2 <= mins <= e2)
