// What happens when someone presses Join.
const button = document.getElementById("join");
const msg = document.getElementById("msg");

button.addEventListener("click", async () => {
  const email = document.getElementById("email").value;
  try {
    const res = await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    msg.textContent = res.ok ? "Thanks, you are on the list." : "Something went wrong. Please try again.";
  } catch {
    msg.textContent = "Something went wrong. Please try again.";
  }
});
