# Inside the JVM: from Hello.class to a running program

You ran `javac` and got `Hello.class`. Now you run `java Hello`, and the JVM takes over. Here’s the whole journey — loading, linking, the memory model, and the one diagram everyone should be able to draw.

## Getting the class in

The `java` launcher boots a JVM (`JNI_CreateJavaVM`) and sets up the runtime data areas. Before `main` can run, it needs the `Hello` class — loaded by a chain of **class loaders**:

- **Bootstrap** → core classes
- **Platform** → JDK modules
- **Application** → your classpath

A request **delegates up** to the parent first; only if no parent has it does the child load it. This keeps core classes trustworthy.

## Loading → Linking → Initialization

1. **Load** — read the `.class` bytes, build a `Class` object in the Method Area.
2. **Verify** — the bytecode verifier proves the code is safe (stack never over/underflows, types line up, jumps are valid). Bad bytecode is rejected here — which is why the JVM can run untrusted classes.
3. **Prepare** — allocate static fields, set them to **defaults** (`0`, `false`, `null`). Your `= 5` has not run yet.
4. **Resolve** — turn symbolic constant-pool references (like `System.out.println`) into direct references. Often lazy.
5. **Initialize** — now `<clinit>` runs: static initializers and assignments, on first active use, superclass first, exactly once.

## The runtime data areas

**Shared across all threads:**

- **Method Area / Metaspace** — class metadata, the runtime constant pool, static fields
- **Heap** — every object and array; GC-managed (Eden, Survivor S0/S1, Old)

**Private, one set per thread:**

- **JVM Stack** — a stack of frames, one per method call
- **PC Register** — the current bytecode address
- **Native Method Stack** — for JNI / native calls

## The one relationship to remember

> The stack holds **references** into the heap. Primitives sit *in* the frame; objects do **not**.

A local variable `p` holds only a **reference** — a pointer into the heap, where the actual `Person` object lives with its fields. `age = 42` sits in the frame; the `Person` sits in the heap.

## Executing

Every method call pushes a **frame** (its own locals + operand stack); returning pops it. Bytecode drives the operand stack:

```java
iload_1   // [ 2 ]
iload_2   // [ 2, 3 ]
iadd      // [ 5 ]
istore_3  // [ ]
```

The interpreter runs this; a method that gets hot is compiled by the **C1/C2 JIT** into native code kept in the code cache.

Creating an object:

```java
new Person        // allocate in Eden, fields = defaults
dup               // keep a reference on the stack
invokespecial <init>  // run the constructor
astore_2          // p = the reference
```

## Garbage collection

GC starts from the **roots** — stack locals, static fields, JNI refs — and keeps everything reachable from them. Unreachable objects are swept; survivors age Eden → Survivor → Old.

## The whole journey, one line

`Hello.class` on disk → **load** → **verify · prepare · resolve** → **initialize** → **execute** (main frame on the stack, objects on the heap) → **JIT** hot code, **GC** the unreachable → `main` returns → JVM exits.
