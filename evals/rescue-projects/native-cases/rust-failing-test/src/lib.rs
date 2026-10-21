pub fn total(prices: &[i32]) -> i32 {
    prices.iter().sum::<i32>() + 1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_up() {
        assert_eq!(total(&[2, 2]), 4);
    }
}
