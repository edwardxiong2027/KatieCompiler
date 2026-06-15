/* examples.js — starter programs available from the Examples menu. */

const EXAMPLES = {
  hello: `# Welcome to Katie — a Python playground that runs in your browser.
# Press Run (or Ctrl/Cmd + Enter) to try it.

name = "world"
print(f"Hello, {name}!")

for i in range(1, 6):
    print(i, "squared is", i * i)
`,

  fib: `# Fibonacci numbers

def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

for i in range(12):
    print(f"fib({i}) = {fib(i)}")
`,

  numpy: `# NumPy array math (the package loads automatically on first use)
import numpy as np

a = np.arange(1, 11)
print("array:    ", a)
print("squared:  ", a ** 2)
print("sum:      ", a.sum())
print("mean:     ", a.mean())
print("reshaped:\\n", a.reshape(2, 5))
`,

  plot: `# A matplotlib plot — the figure appears in the Output panel.
import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 2 * np.pi, 200)
plt.figure(figsize=(6, 3.5))
plt.plot(x, np.sin(x), label="sin(x)")
plt.plot(x, np.cos(x), label="cos(x)")
plt.title("Sine and cosine")
plt.legend()
plt.grid(True, alpha=0.3)
plt.show()
`,

  bars: `# A simple bar chart
import matplotlib.pyplot as plt

fruit = ["apples", "pears", "plums", "figs"]
counts = [12, 7, 5, 9]

plt.figure(figsize=(6, 3.5))
plt.bar(fruit, counts, color="#2f6df6")
plt.title("Fruit in the bowl")
plt.ylabel("count")
plt.show()
`,

  input: `# input() reads what you type in the console below.
# Run this, then type your answer on the console line and press Enter.
name = input("What's your name? ")
age = input("How old are you? ")
print(f"Hi {name}! Next year you'll be {int(age) + 1}.")
`,
};
