from bots.execution.base import OrderResult


def test_order_result_fields():
    r = OrderResult(status="submitted", order_id="X", message="ok")
    assert r.status == "submitted"
    assert r.order_id == "X"
    assert r.message == "ok"
