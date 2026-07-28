# How javac really compiles your code

When you run `javac Hello.java`, a surprising thing happens: **a JVM starts** — but it runs the *compiler*, not your program. Your `main()` never executes at compile time. Let’s trace what actually happens.

## The launch

`javac` is a thin **native launcher** (built on `libjli`). It:

1. finds the JDK and loads **libjvm**
2. calls `JNI_CreateJavaVM` to boot a JVM *in the same process*
3. invokes the Java class `com.sun.tools.javac.Main`, which builds a `JavaCompiler`

So the JVM is real — it’s just running the compiler’s bytecode, not yours.

## The front end

The compiler understands your code in five phases:

1. **Parse** — the `Scanner` turns characters into tokens; `JavacParser` builds an **AST**.
2. **Enter** — every name becomes a symbol in a scope (`Enter`, `MemberEnter`).
3. **Process** — annotation processors run in **rounds**; a processor can generate new source, looping back to Parse.
4. **Attribute** — `Attr` resolves names and assigns a **type** to every node. `int += int` is fine; `int = "x"` is the error you see. Inference (`var`, generics) happens here.
5. **Flow** — definite assignment, reachability, checked-exception analysis. *“Variable might not be initialized”* comes from here.

## The back end

6. **Desugar** — `TransTypes` erases generics; `Lower` rewrites sugar into plain Java. An enhanced-for over an array becomes an indexed loop:

```java
// before
for (int x : a) t += x;

// after
for (int i = 0; i < a.length; i++) {
    int x = a[i];
    t += x;
}
```

7. **Generate** — `Gen` walks the lowered tree and emits **bytecode** into a `Code` buffer, computing StackMapTable frames.

8. **Write** — `ClassWriter` builds the constant pool and serializes the `.class` file. Its first bytes:

```
CA FE BA BE   magic — "CAFEBABE"
00 00 00 41   version 65 → Java 21
...           constant pool, methods, attributes
```

## The punchline

A JVM absolutely ran during compilation — but it ran the **compiler**. Your program’s bytecode only runs later, at `java Hello`. Loading, bytecode verification, and the JIT all happen then, inside the JVM — not in the compiler.

> Compilation translates your code; execution runs it. That’s the whole compile-vs-run boundary.
