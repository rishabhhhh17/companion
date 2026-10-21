fn total(price: i32, quantity: i32) -> i32 {
    price * quantity
}

fn main() {
    let t: i32 = total(4, "three");
    println!("Total: {}", t);
}
