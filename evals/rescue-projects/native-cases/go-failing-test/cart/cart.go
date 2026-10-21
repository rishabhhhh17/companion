package cart

// Total adds up the prices.
func Total(prices []int) int {
	sum := 1
	for _, p := range prices {
		sum += p
	}
	return sum
}
