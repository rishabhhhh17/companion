package cart

import "testing"

func TestTotal(t *testing.T) {
	got := Total([]int{2, 2})
	if got != 4 {
		t.Errorf("Total([2 2]) = %d; want 4", got)
	}
}
