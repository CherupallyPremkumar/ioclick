# HashMap Internals: from buckets to treeify threshold

When you put a key-value pair into a Java `HashMap`, it feels instant — an $O(1)$ average time operation. But under the hood, Java manages array indexing, hash distribution, linked lists, and balanced trees.

## 1. Hash Code & Bucket Index

Java calculates the bucket array index using:

```java
int hash = key.hashCode();
int index = (n - 1) & (hash ^ (hash >>> 16));
```

The bitwise AND `(n - 1) & hash` works as a fast modulo operator because array length `n` is always a power of 2.

## 2. Handling Collisions

When two distinct keys resolve to the exact same bucket index, a **collision** occurs. Java resolves collisions by chaining entries at that bucket index.

- **Java 7**: Used a standard singly-linked list for collisions.
- **Java 8+**: Converts the linked list to a **Red-Black Tree** if collision depth reaches `TREEIFY_THRESHOLD = 8` and table capacity is at least 64.

```
Bucket Index 4: [Node A] -> [Node B] -> [Node C] ... (turns into TreeNode if > 8)
```

## 3. Why Treeify Matters

Without treeification, a malicious actor or bad `hashCode()` implementation could flood a single bucket with $N$ collisions, degrading lookup time to $O(N)$. With Red-Black trees, worst-case lookup time is capped at $O(\log N)$.
