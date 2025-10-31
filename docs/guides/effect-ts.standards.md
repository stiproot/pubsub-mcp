# Effect-TS Coding Standards & Best Practices

**Version:** 1.0
**Last Updated:** 2025-10-08
**Purpose:** Comprehensive guide for developer agents and engineers working with Effect-TS

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Error Handling Patterns](#error-handling-patterns)
3. [Dependency Injection & Services](#dependency-injection--services)
4. [Concurrency & Parallelism](#concurrency--parallelism)
5. [Resource Management](#resource-management)
6. [Data Types & Modeling](#data-types--modeling)
7. [HTTP & Networking](#http--networking)
8. [Schema & Validation](#schema--validation)
9. [Observability & Logging](#observability--logging)
10. [Testing Patterns](#testing-patterns)
11. [Stream Processing](#stream-processing)
12. [Performance & Optimization](#performance--optimization)

---

## Core Concepts

### 1. Effects are Lazy Blueprints

**Pattern:** Understand that an Effect is a lazy, immutable blueprint that does nothing until executed.

**When to Use:**

- Always when working with Effect-TS
- Understanding the fundamental execution model

**Key Standards:**

```typescript
// ✅ GOOD: Effect is just a description
const program = Effect.gen(function* () {
  yield* Effect.log("This only runs when executed")
  return 42
})

// Execute explicitly
Effect.runPromise(program)

// ❌ BAD: Don't expect effects to run on definition
const result = Effect.log("This doesn't run yet")
// Nothing happens until you call runPromise/runSync
```

**Common Pitfalls:**

- Assuming Effects behave like Promises (which execute immediately)
- Forgetting to execute Effects with a runtime function
- Not understanding that defining an Effect has zero side effects

**Related Patterns:** execute-with-runpromise, execute-with-runsync

---

### 2. Use Effect.gen for Business Logic

**Pattern:** Write sequential business logic using Effect.gen for improved readability.

**When to Use:**

- Multi-step business workflows
- Conditional branching logic
- When you need sequential execution with error handling

**Key Standards:**

```typescript
// ✅ GOOD: Clear, sequential logic with Effect.gen
const createUser = (userData: any) =>
  Effect.gen(function* () {
    const validated = yield* validateUser(userData)
    const hashed = yield* hashPassword(validated.password)
    return yield* dbCreateUser({ ...validated, password: hashed })
  })

// ❌ BAD: Long chains of andThen/flatMap
const createUser = (userData: any) =>
  validateUser(userData)
    .pipe(
      Effect.flatMap(validated =>
        hashPassword(validated.password).pipe(
          Effect.flatMap(hashed =>
            dbCreateUser({ ...validated, password: hashed })
          )
        )
      )
    )
```

**Common Pitfalls:**

- Using long andThen/flatMap chains for business logic
- Not yielding Effects with `yield*`
- Mixing imperative and declarative styles

**Related Patterns:** use-pipe-for-composition, avoid-long-andthen-chains

---

### 3. Use .pipe for Composition

**Pattern:** Chain transformations using .pipe() for readable, top-to-bottom flow.

**When to Use:**

- Applying multiple transformations to an Effect
- Building composable data pipelines
- When readability matters more than generator syntax

**Key Standards:**

```typescript
// ✅ GOOD: Clear pipeline with .pipe
const program = Effect.succeed(5).pipe(
  Effect.map(n => n * 2),
  Effect.map(n => `Result: ${n}`),
  Effect.tap(Effect.log)
)

// ❌ BAD: Deeply nested function calls
const program = Effect.tap(
  Effect.map(
    Effect.map(Effect.succeed(5), n => n * 2),
    n => `Result: ${n}`
  ),
  Effect.log
)
```

**Common Pitfalls:**

- Manual nesting instead of pipe
- Using pipe for complex control flow (use Effect.gen instead)
- Forgetting that pipe reads top-to-bottom

**Related Patterns:** transform-effect-values, control-flow-with-combinators

---

### 4. Execution Methods

**Pattern:** Choose the right execution method for your use case.

**When to Use:**

- `Effect.runPromise` - For async effects in async contexts
- `Effect.runSync` - For synchronous effects (no async operations)
- `Effect.runFork` - For long-running applications (servers)

**Key Standards:**

```typescript
// ✅ GOOD: Use runPromise for async effects
await Effect.runPromise(fetchUser(123))

// ✅ GOOD: Use runSync for pure sync effects
const result = Effect.runSync(Effect.succeed(42))

// ✅ GOOD: Use runFork for servers
const fiber = Effect.runFork(httpServer)

// ❌ BAD: Using runSync with async effects
Effect.runSync(Effect.promise(() => fetch(...))) // Will throw!
```

**Common Pitfalls:**

- Using runSync with async operations
- Not handling Promise rejections from runPromise
- Forgetting that runFork returns a Fiber (not a value)

**Related Patterns:** execute-long-running-apps-with-runfork

---

## Error Handling Patterns

### 1. Define Type-Safe Errors with Data.TaggedError

**Pattern:** Create custom error classes extending Data.TaggedError for type-safe error handling.

**When to Use:**

- Any distinct failure mode in your application
- When you need discriminated error unions
- To enable type-safe error recovery with catchTag

**Key Standards:**

```typescript
// ✅ GOOD: Tagged errors with rich context
class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly cause: unknown
  readonly query?: string
}> {}

class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly id: string
}> {}

// Use in effect signatures
const findUser = (id: string): Effect.Effect<User, DatabaseError | NotFoundError> =>
  Effect.gen(function* () {
    if (id === "invalid") {
      return yield* Effect.fail(new DatabaseError({ cause: "Invalid ID" }))
    }
    // ...
  })

// ❌ BAD: Generic Error objects
const findUser = (id: string): Effect.Effect<User, Error> =>
  Effect.fail(new Error("Something went wrong"))
```

**Common Pitfalls:**

- Using generic Error instead of tagged errors
- Not including useful context in error data
- Losing type information in error channels

**Related Patterns:** handle-errors-with-catch, mapping-errors-to-fit-your-domain

---

### 2. Handle Errors with catchTag/catchTags/catchAll

**Pattern:** Use catchTag for specific errors, catchTags for multiple, catchAll for any error.

**When to Use:**

- Recovering from specific failure modes
- Applying different recovery logic per error type
- Converting errors to success values

**Key Standards:**

```typescript
// ✅ GOOD: Type-safe error handling with catchTag
const result = yield* fetchUser(id).pipe(
  Effect.catchTag("NotFoundError", (e) =>
    Effect.succeed(defaultUser)
  ),
  Effect.catchTag("NetworkError", (e) =>
    Effect.retry(fetchUser(id), retryPolicy)
  )
)

// ✅ GOOD: Handle multiple error types at once
const result = yield* operation.pipe(
  Effect.catchTags({
    NetworkError: (e) => Effect.log(`Network: ${e.message}`),
    ValidationError: (e) => Effect.log(`Validation: ${e.field}`)
  })
)

// ❌ BAD: Using try/catch inside Effects
Effect.gen(function* () {
  try {
    const result = yield* riskyOperation
  } catch (error) {
    // This bypasses Effect's error channel!
  }
})
```

**Common Pitfalls:**

- Using try/catch instead of Effect error handling
- Not handling all possible error types
- Using catchAll when you should be specific

**Related Patterns:** define-tagged-errors, retry-based-on-specific-errors

---

### 3. Map Errors to Fit Your Domain

**Pattern:** Transform external errors into domain-specific errors.

**When to Use:**

- At boundaries with external systems
- Converting library errors to domain errors
- Standardizing error types across layers

**Key Standards:**

```typescript
// ✅ GOOD: Map external errors to domain errors
class ApiError extends Data.TaggedError("ApiError")<{
  readonly code: number
  readonly endpoint: string
}> {}

const fetchData = (url: string) =>
  Http.get(url).pipe(
    Effect.mapError(error =>
      new ApiError({
        code: error.status,
        endpoint: url
      })
    )
  )

// ❌ BAD: Letting external errors leak into domain
const fetchData = (url: string) =>
  Http.get(url) // Returns Http.HttpError, not domain error
```

**Common Pitfalls:**

- Letting external error types leak into domain layer
- Losing important error context during mapping
- Not establishing clear error boundaries

**Related Patterns:** handle-api-errors, distinguish-not-found-from-errors

---

### 4. Handle Unexpected Errors with Cause

**Pattern:** Use Cause to inspect and handle unexpected errors, defects, and interruptions.

**When to Use:**

- Debugging complex error scenarios
- Handling defects (unexpected errors)
- Distinguishing failures from interruptions

**Key Standards:**

```typescript
// ✅ GOOD: Comprehensive error handling with Cause
const program = riskyOperation.pipe(
  Effect.sandbox,
  Effect.catchAll(cause =>
    Cause.match(cause, {
      onEmpty: Effect.succeed("Empty"),
      onFail: (error) => Effect.log(`Expected error: ${error._tag}`),
      onDie: (defect) => Effect.log(`Unexpected defect: ${defect}`),
      onInterrupt: (fiberId) => Effect.log(`Interrupted: ${fiberId}`),
      onSequential: (left, right) => Effect.log("Sequential errors"),
      onParallel: (left, right) => Effect.log("Parallel errors")
    })
  )
)

// ❌ BAD: Only catching expected errors
const program = riskyOperation.pipe(
  Effect.catchAll(error => Effect.log(`Error: ${error}`))
  // Defects and interruptions are not handled!
)
```

**Common Pitfalls:**

- Not handling defects separately from failures
- Ignoring interruption signals
- Not understanding Cause's rich error model

**Related Patterns:** handle-errors-with-catch, data-cause

---

## Dependency Injection & Services

### 1. Model Dependencies as Services

**Pattern:** Abstract external dependencies into swappable, testable services.

**When to Use:**

- Any external dependency (DB, HTTP, file system)
- Capabilities you want to mock in tests
- Cross-cutting concerns (logging, config, time)

**Key Standards:**

```typescript
// ✅ GOOD: Service with Effect.Service
export class Database extends Effect.Service<Database>()(
  "Database",
  {
    sync: () => ({
      findUser: (id: string) =>
        Effect.gen(function* () {
          // Implementation
        })
    })
  }
) {}

// Usage
const program = Effect.gen(function* () {
  const db = yield* Database
  const user = yield* db.findUser("123")
  return user
})

// ❌ BAD: Direct dependencies
const findUser = (id: string) => {
  const result = await fetch(`/api/users/${id}`)
  // Tightly coupled to fetch!
}
```

**Common Pitfalls:**

- Directly calling external APIs instead of using services
- Not making impure functions (Math.random, Date.now) into services
- Tight coupling to specific implementations

**Related Patterns:** understand-layers-for-dependency-injection, mocking-dependencies-in-tests

---

### 2. Understand Layers for Dependency Injection

**Pattern:** A Layer describes how to construct a service and its dependencies.

**When to Use:**

- Building service instances
- Composing dependencies
- Separating construction from usage

**Key Standards:**

```typescript
// ✅ GOOD: Layer-based dependency injection
export class Logger extends Effect.Service<Logger>()(
  "Logger",
  { sync: () => ({ log: (msg: string) => Effect.log(msg) }) }
) {}

export class Notifier extends Effect.Service<Notifier>()(
  "Notifier",
  {
    effect: Effect.gen(function* () {
      const logger = yield* Logger
      return {
        notify: (msg: string) => logger.log(`Notifying: ${msg}`)
      }
    }),
    dependencies: [Logger.Default]
  }
) {}

// ❌ BAD: Manual service instantiation
class Logger {
  log(msg: string) { console.log(msg) }
}

class Notifier {
  constructor(private logger: Logger) {}
}

const logger = new Logger()
const notifier = new Notifier(logger)
```

**Common Pitfalls:**

- Manual instantiation instead of Layers
- Not declaring dependencies explicitly
- Tight coupling through constructors

**Related Patterns:** model-dependencies-as-services, compose-scoped-layers

---

### 3. Organize Layers into Composable Modules

**Pattern:** Group related layers into modules for better organization.

**When to Use:**

- Building large applications
- Separating concerns by feature
- Creating reusable layer combinations

**Key Standards:**

```typescript
// ✅ GOOD: Modular layer organization
// database.ts
export const DatabaseLive = Layer.succeed(Database, implementation)

// http.ts
export const HttpLive = Layer.succeed(HttpClient, implementation)

// app.ts
export const AppLive = Layer.merge(
  DatabaseLive,
  HttpLive
).pipe(
  Layer.provide(ConfigLive)
)

// ❌ BAD: Monolithic layer construction
const everything = Layer.succeed(Database, dbImpl).pipe(
  Layer.merge(Layer.succeed(Http, httpImpl)),
  Layer.merge(Layer.succeed(Logger, logImpl)),
  // Unmanageable!
)
```

**Common Pitfalls:**

- Monolithic layer definitions
- Circular dependencies between layers
- Not grouping related services

**Related Patterns:** provide-config-layer, compose-scoped-layers

---

## Concurrency & Parallelism

### 1. Run Independent Effects in Parallel with Effect.all

**Pattern:** Use Effect.all with explicit concurrency to run independent effects concurrently.

**When to Use:**

- Multiple independent API calls
- Parallel data processing
- When order doesn't matter

**Key Standards:**

```typescript
// ✅ GOOD: Explicit concurrency with Effect.all
const program = Effect.all(
  [fetchUser, fetchPosts, fetchComments],
  { concurrency: "unbounded" }
)

// ✅ GOOD: Limited concurrency
const results = yield* Effect.all(
  urls.map(url => fetchData(url)),
  { concurrency: 5 } // Max 5 concurrent requests
)

// ❌ BAD: Sequential execution when parallel is possible
const program = Effect.gen(function* () {
  const user = yield* fetchUser      // Wait for user
  const posts = yield* fetchPosts    // Then wait for posts
  const comments = yield* fetchComments // Then wait for comments
  return { user, posts, comments }
})

// ❌ BAD: Missing concurrency option (will be sequential)
const results = Effect.all([task1, task2, task3])
// This is sequential! Must specify concurrency.
```

**Common Pitfalls:**

- Running independent effects sequentially
- Forgetting to specify concurrency option
- Using unbounded concurrency for resource-limited operations

**Related Patterns:** race-concurrent-effects, process-collection-in-parallel-with-foreach

---

### 2. Understand Fibers as Lightweight Threads

**Pattern:** Fibers are virtual threads for massive concurrency without OS thread overhead.

**When to Use:**

- Background tasks
- Concurrent I/O operations
- Building highly concurrent systems

**Key Standards:**

```typescript
// ✅ GOOD: Fork background tasks
const program = Effect.gen(function* () {
  const fiber1 = yield* Effect.fork(backgroundTask1)
  const fiber2 = yield* Effect.fork(backgroundTask2)

  // Do other work
  yield* mainTask

  // Wait for background tasks
  yield* Fiber.join(fiber1)
  yield* Fiber.join(fiber2)
})

// ✅ GOOD: Massive fiber concurrency
const fibers = yield* Effect.forEach(
  Array.from({ length: 100_000 }, (_, i) => task(i)),
  Effect.fork
)

// ❌ BAD: Thinking fibers provide CPU parallelism
// Fibers run on a thread pool, great for I/O, not CPU-bound work
```

**Common Pitfalls:**

- Confusing fibers with OS threads
- Expecting CPU parallelism for compute-bound tasks
- Not understanding that fibers are for concurrency, not parallelism

**Related Patterns:** run-background-tasks-with-fork, decouple-fibers-with-queue-pubsub

---

### 3. Control Repetition with Schedule

**Pattern:** Use Schedule to create composable retry/repeat policies.

**When to Use:**

- Retry logic with backoff
- Polling operations
- Rate limiting
- Periodic tasks

**Key Standards:**

```typescript
// ✅ GOOD: Composable schedule policies
const policy = Schedule.exponential("100 millis").pipe(
  Schedule.jittered,
  Schedule.compose(Schedule.recurs(5))
)

const result = yield* Effect.retry(flakyOperation, policy)

// ✅ GOOD: Repeat until condition
const poll = Effect.repeat(
  checkStatus,
  Schedule.recurWhile(status => status !== "complete")
)

// ❌ BAD: Manual retry logic
function manualRetry(effect: Effect.Effect<A>, tries: number) {
  return effect.pipe(
    Effect.catchAll(() => {
      if (tries > 0) {
        return Effect.sleep(1000).pipe(
          Effect.flatMap(() => manualRetry(effect, tries - 1))
        )
      }
      return Effect.fail("MaxRetriesExceeded")
    })
  )
}
```

**Common Pitfalls:**

- Writing manual retry loops
- Not adding jitter to avoid thundering herd
- Hard-coding delays instead of using Schedule

**Related Patterns:** retry-based-on-specific-errors, poll-for-status-until-task-completes

---

### 4. Race Concurrent Effects

**Pattern:** Use Effect.race to run effects concurrently and take the first to complete.

**When to Use:**

- Implementing timeouts
- Fallback strategies
- Fastest-response patterns

**Key Standards:**

```typescript
// ✅ GOOD: Race with timeout
const result = yield* Effect.race(
  slowOperation,
  Effect.sleep("5 seconds").pipe(
    Effect.as(new TimeoutError())
  )
)

// ✅ GOOD: Try multiple sources
const data = yield* Effect.race(
  fetchFromPrimary,
  fetchFromBackup
)

// ❌ BAD: Sequential with manual timeout tracking
const result = yield* slowOperation.pipe(
  Effect.timeout("5 seconds")
)
// This works but race is more flexible
```

**Common Pitfalls:**

- Not understanding that loser is interrupted
- Using race when you need all results
- Forgetting to handle the "lost" computation

**Related Patterns:** handle-flaky-operations-with-retry-timeout

---

## Resource Management

### 1. Manage Resource Lifecycles with Scope

**Pattern:** Use Scope to guarantee cleanup of resources via finalizers.

**When to Use:**

- File handles, database connections
- Any acquire/release pattern
- Ensuring cleanup on error or interruption

**Key Standards:**

```typescript
// ✅ GOOD: Scoped resource management
const scopedFile = Effect.acquireRelease(
  Effect.log("File opened").pipe(Effect.as({ write: (s: string) => Effect.log(s) })),
  () => Effect.log("File closed")
)

const program = Effect.gen(function* () {
  const file = yield* Effect.scoped(scopedFile)
  yield* file.write("hello")
  yield* file.write("world")
  // File automatically closed here, even on error
})

// ❌ BAD: Manual resource management
const program = Effect.gen(function* () {
  const file = yield* openFile
  yield* file.write("hello")
  // If error occurs here, file is never closed!
  yield* closeFile(file)
})
```

**Common Pitfalls:**

- Forgetting to close resources on error
- Manual cleanup instead of scopes
- Not understanding scope guarantees

**Related Patterns:** safely-bracket-resource-usage, compose-scoped-layers

---

### 2. Safely Bracket Resource Usage

**Pattern:** Use Effect.acquireRelease or Effect.acquireUseRelease for safe resource handling.

**When to Use:**

- Same as Scope pattern
- When you want explicit acquire/use/release structure

**Key Standards:**

```typescript
// ✅ GOOD: Bracket pattern
const program = Effect.acquireUseRelease(
  openDatabaseConnection,
  connection => runQuery(connection),
  connection => closeConnection(connection)
)

// ✅ GOOD: Multiple resources
const program = Effect.gen(function* () {
  const db = yield* Effect.scoped(acquireDatabase)
  const cache = yield* Effect.scoped(acquireCache)
  // Both cleaned up automatically
  yield* businessLogic(db, cache)
})

// ❌ BAD: Nested try/finally
try {
  const conn = openConnection()
  try {
    runQuery(conn)
  } finally {
    closeConnection(conn)
  }
} finally {
  // Complex and error-prone
}
```

**Common Pitfalls:**

- Nested try/finally instead of scopes
- Forgetting finalizers run on interruption too
- Not using acquireRelease for resources

**Related Patterns:** manage-resource-lifecycles-with-scope, create-managed-runtime-for-scoped-resources

---

## Data Types & Modeling

### 1. Model Optional Values with Option

**Pattern:** Use `Option<A>` to represent values that may or may not exist.

**When to Use:**

- Replacing null/undefined
- Optional fields in domain models
- Partial results

**Key Standards:**

```typescript
// ✅ GOOD: Option for optional values
function findUser(id: string): Option.Option<User> {
  return id === "1"
    ? Option.some({ id, name: "Alice" })
    : Option.none()
}

// Pattern matching
const result = findUser("1").pipe(
  Option.match({
    onNone: () => "User not found",
    onSome: (user) => `Found: ${user.name}`
  })
)

// ❌ BAD: Using null/undefined
function findUser(id: string): User | null {
  return id === "1" ? { id, name: "Alice" } : null
}

// Easy to forget null check!
const user = findUser("1")
console.log(user.name) // Potential null reference error
```

**Common Pitfalls:**

- Using null/undefined instead of Option
- Not handling None case
- Unwrapping Option unsafely

**Related Patterns:** data-either, model-optional-values-with-option

---

### 2. Use Either for Error Accumulation

**Pattern:** Use Either<E, A> to represent computations that can fail.

**When to Use:**

- Validation with multiple errors
- Computations that may fail
- When you need error accumulation

**Key Standards:**

```typescript
// ✅ GOOD: Either for validation
const validateEmail = (s: string): Either.Either<string, Email> =>
  s.includes("@")
    ? Either.right(s as Email)
    : Either.left("Invalid email")

const validateAge = (n: number): Either.Either<string, Age> =>
  n >= 18
    ? Either.right(n as Age)
    : Either.left("Must be 18+")

// Accumulate all errors
const validation = Either.all([
  validateEmail(email),
  validateAge(age)
])

// ❌ BAD: Throwing exceptions
function validateEmail(s: string): Email {
  if (!s.includes("@")) {
    throw new Error("Invalid email")
  }
  return s as Email
}
```

**Common Pitfalls:**

- Using exceptions instead of Either
- Not accumulating errors
- Confusing Either with Option

**Related Patterns:** accumulate-multiple-errors-with-either, data-option

---

### 3. Brand Types for Domain Validation

**Pattern:** Use Brand to create validated domain types that are incompatible at compile time.

**When to Use:**

- Domain-specific types (Email, UserId, PositiveNumber)
- Preventing mixing of semantically different strings/numbers
- Type-safe identifiers

**Key Standards:**

```typescript
// ✅ GOOD: Branded types with validation
type Email = string & Brand.Brand<"Email">

const EmailSchema = Schema.String.pipe(
  Schema.pattern(/^[^@]+@[^@]+$/),
  Schema.brand("Email")
)

const parseEmail = (input: string) =>
  Schema.decode(EmailSchema)(input)

// Type safety
function sendEmail(to: Email, body: string) {
  // Can only pass validated Email
}

sendEmail("test@example.com", "Hi") // ❌ Type error!
sendEmail(parseEmail("test@example.com"), "Hi") // ✅ OK

// ❌ BAD: Type aliases don't prevent mixing
type Email = string
type UserId = string

function sendEmail(to: Email) {}
const userId: UserId = "user123"
sendEmail(userId) // ❌ Compiles but wrong!
```

**Common Pitfalls:**

- Using plain type aliases instead of brands
- Not validating branded types
- Creating brands without runtime enforcement

**Related Patterns:** brand-validate-parse, model-validated-domain-types-with-brand

---

### 4. Manage Shared State with Ref

**Pattern:** Use `Ref<A>` for atomic, concurrent-safe mutable state.

**When to Use:**

- Counters, caches
- Shared state between fibers
- State that needs atomic updates

**Key Standards:**

```typescript
// ✅ GOOD: Ref for shared state
const program = Effect.gen(function* () {
  const counter = yield* Ref.make(0)

  // Atomic update
  yield* Ref.update(counter, n => n + 1)

  // Atomic read
  const value = yield* Ref.get(counter)
  yield* Effect.log(`Counter: ${value}`)
})

// ✅ GOOD: Concurrent access is safe
const program = Effect.gen(function* () {
  const counter = yield* Ref.make(0)

  yield* Effect.all(
    Array.from({ length: 1000 }, () =>
      Ref.update(counter, n => n + 1)
    ),
    { concurrency: "unbounded" }
  )

  const final = yield* Ref.get(counter)
  // Always 1000, no race conditions
})

// ❌ BAD: Plain variables in concurrent code
let counter = 0

const program = Effect.all(
  Array.from({ length: 1000 }, () =>
    Effect.sync(() => counter++)
  ),
  { concurrency: "unbounded" }
)
// Race conditions! Final value unpredictable
```

**Common Pitfalls:**

- Using plain variables for shared state
- Race conditions with non-atomic operations
- Not understanding Ref's concurrency guarantees

**Related Patterns:** manage-shared-state-with-ref, data-ref

---

### 5. Use Chunk for High-Performance Collections

**Pattern:** Use Chunk for append-efficient, immutable collections.

**When to Use:**

- Building large collections incrementally
- When append performance matters
- Streaming-like operations

**Key Standards:**

```typescript
// ✅ GOOD: Chunk for efficient appends
let chunk = Chunk.empty<number>()
for (let i = 0; i < 10000; i++) {
  chunk = Chunk.append(chunk, i)
}

// ✅ GOOD: Chunk with streams
const stream = Stream.fromChunk(myChunk)

// ❌ BAD: Array with frequent appends
let arr: number[] = []
for (let i = 0; i < 10000; i++) {
  arr = [...arr, i] // O(n) each iteration!
}
```

**Common Pitfalls:**

- Using Arrays when appends are frequent
- Not understanding Chunk's performance characteristics
- Unnecessary conversions between Array and Chunk

**Related Patterns:** use-chunk-for-high-performance-collections, data-chunk

---

## HTTP & Networking

### 1. Make HTTP Client Requests

**Pattern:** Use @effect/platform Http.client instead of fetch.

**When to Use:**

- Making HTTP requests from server/client
- Calling external APIs
- Any network communication

**Key Standards:**

```typescript
// ✅ GOOD: Effect HTTP client
import * as Http from "@effect/platform/HttpClient"

const fetchUser = (id: string) =>
  Http.get(`https://api.example.com/users/${id}`).pipe(
    Http.client.execute,
    Effect.flatMap(response => response.json),
    Effect.flatMap(Schema.decode(UserSchema))
  )

// ✅ GOOD: With retries and timeout
const fetchUser = (id: string) =>
  Http.get(`https://api.example.com/users/${id}`).pipe(
    Http.client.execute,
    Effect.retry(retryPolicy),
    Effect.timeout("5 seconds")
  )

// ❌ BAD: Using raw fetch
const fetchUser = (id: string) =>
  Effect.tryPromise({
    try: () => fetch(`https://api.example.com/users/${id}`),
    catch: () => new Error("Fetch failed")
  })
```

**Common Pitfalls:**

- Using fetch instead of Effect HTTP client
- Not handling interruption properly
- Missing typed error handling

**Related Patterns:** make-http-client-request, handle-api-errors

---

### 2. Build HTTP Servers

**Pattern:** Use @effect/platform HttpServer for building APIs.

**When to Use:**

- Building REST APIs
- Web servers
- Any HTTP-based service

**Key Standards:**

```typescript
// ✅ GOOD: Effect HTTP server
import * as HttpServer from "@effect/platform/HttpServer"
import * as HttpRouter from "@effect/platform/HttpRouter"

const app = HttpRouter.empty.pipe(
  HttpRouter.get("/users/:id",
    Effect.flatMap(HttpRouter.params, params =>
      Effect.flatMap(UserService, service =>
        service.findUser(params.id).pipe(
          Effect.flatMap(HttpResponse.json)
        )
      )
    )
  )
)

const server = HttpServer.serve(app)

// ✅ GOOD: With middleware and error handling
const app = HttpRouter.empty.pipe(
  HttpRouter.get("/users/:id", userHandler),
  HttpRouter.post("/users", createUserHandler)
).pipe(
  HttpRouter.middleware(loggingMiddleware),
  HttpRouter.middleware(authMiddleware)
)

// ❌ BAD: Using Express without Effect
app.get("/users/:id", async (req, res) => {
  // No effect integration, manual error handling
  try {
    const user = await db.findUser(req.params.id)
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: "Internal error" })
  }
})
```

**Common Pitfalls:**

- Not integrating HTTP with Effect
- Manual error handling instead of Effect's error channel
- Missing structured concurrency benefits

**Related Patterns:** build-a-basic-http-server, handle-get-request, provide-dependencies-to-routes

---

## Schema & Validation

### 1. Define Contracts with Schema

**Pattern:** Define data shapes with Schema before implementation.

**When to Use:**

- API contracts
- Domain models
- Any external data validation

**Key Standards:**

```typescript
// ✅ GOOD: Schema-first design
const UserSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String.pipe(
    Schema.pattern(/^[^@]+@[^@]+$/)
  ),
  age: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0)
  )
})

type User = Schema.Schema.Type<typeof UserSchema>

// Use for validation
const parseUser = Schema.decode(UserSchema)

// ✅ GOOD: Schema composition
const CreateUserRequest = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  age: Schema.Number
})

const UserResponse = UserSchema.pipe(
  Schema.extend(Schema.Struct({
    createdAt: Schema.Date
  }))
)

// ❌ BAD: Implicit validation
interface User {
  id: number
  name: string
  email: string
}

function createUser(data: any): User {
  // No runtime validation!
  return data as User
}
```

**Common Pitfalls:**

- Not validating external data
- Separating types from validation
- Using any without runtime checks

**Related Patterns:** define-contracts-with-schema, parse-with-schema-decode, transform-data-with-schema

---

### 2. Parse and Validate with Schema

**Pattern:** Use Schema.decode for runtime validation.

**When to Use:**

- Parsing API responses
- Validating user input
- Converting unknown data to typed data

**Key Standards:**

```typescript
// ✅ GOOD: Schema-based parsing
const parseUser = Schema.decode(UserSchema)

const program = Effect.gen(function* () {
  const rawData = yield* fetchUserData()
  const user = yield* parseUser(rawData)
  // user is now validated User type
  return user
})

// ✅ GOOD: Handle validation errors
const program = Effect.gen(function* () {
  const result = yield* parseUser(rawData).pipe(
    Effect.catchAll(error =>
      Effect.fail(new ValidationError({
        message: "Invalid user data",
        cause: error
      }))
    )
  )
})

// ❌ BAD: No validation
function parseUser(data: unknown): User {
  return data as User // Unsafe!
}
```

**Common Pitfalls:**

- Type assertions without validation
- Not handling parse errors
- Validating too late in the pipeline

**Related Patterns:** parse-with-schema-decode, validate-request-body

---

## Observability & Logging

### 1. Use Structured Logging

**Pattern:** Use Effect.log* functions instead of console.log.

**When to Use:**

- All logging in Effect applications
- When you need context-aware logs
- Production applications

**Key Standards:**

```typescript
// ✅ GOOD: Effect structured logging
const program = Effect.gen(function* () {
  yield* Effect.logInfo("Processing user", { userId: 123 })
  yield* Effect.logDebug("Query executed", { query: "SELECT ..." })
  yield* Effect.logError("Operation failed", { error: err })
})

// ✅ GOOD: Log levels
const program = Effect.gen(function* () {
  yield* Effect.logTrace("Trace message")
  yield* Effect.logDebug("Debug message")
  yield* Effect.logInfo("Info message")
  yield* Effect.logWarning("Warning message")
  yield* Effect.logError("Error message")
  yield* Effect.logFatal("Fatal message")
})

// ❌ BAD: Using console.log
const program = Effect.gen(function* () {
  console.log("Processing user") // Unstructured, no context
  const result = yield* processUser()
  console.log("Done")
})
```

**Common Pitfalls:**

- Using console.log instead of Effect logging
- Not including structured data
- Missing log levels

**Related Patterns:** leverage-structured-logging, observability-structured-logging

---

### 2. Add Tracing Spans

**Pattern:** Use Effect.withSpan to add distributed tracing.

**When to Use:**

- Debugging performance issues
- Distributed systems
- Understanding execution flow

**Key Standards:**

```typescript
// ✅ GOOD: Add spans for operations
const fetchUser = (id: string) =>
  Effect.gen(function* () {
    const user = yield* database.query(`SELECT * FROM users WHERE id = ${id}`)
    return user
  }).pipe(
    Effect.withSpan("database.fetchUser", { attributes: { userId: id } })
  )

// ✅ GOOD: Nested spans
const processOrder = (orderId: string) =>
  Effect.gen(function* () {
    const order = yield* fetchOrder(orderId)
    const user = yield* fetchUser(order.userId)
    const payment = yield* processPayment(order)
    return { order, user, payment }
  }).pipe(
    Effect.withSpan("order.process", { attributes: { orderId } })
  )

// ❌ BAD: No tracing
const fetchUser = (id: string) =>
  database.query(`SELECT * FROM users WHERE id = ${id}`)
```

**Common Pitfalls:**

- Not adding spans to critical operations
- Missing span attributes
- Not understanding trace context propagation

**Related Patterns:** trace-operations-with-spans, observability-tracing-spans

---

### 3. Add Custom Metrics

**Pattern:** Use Effect metrics to track application behavior.

**When to Use:**

- Monitoring application health
- Tracking business metrics
- Performance monitoring

**Key Standards:**

```typescript
// ✅ GOOD: Custom metrics
const requestCounter = Metric.counter("http.requests.total")
const requestDuration = Metric.histogram("http.request.duration")

const handleRequest = (req: Request) =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeMillis
    yield* Metric.increment(requestCounter)

    const result = yield* processRequest(req)

    const end = yield* Clock.currentTimeMillis
    yield* Metric.update(requestDuration, end - start)

    return result
  })

// ❌ BAD: No metrics
const handleRequest = (req: Request) =>
  processRequest(req)
```

**Common Pitfalls:**

- Not tracking important metrics
- Missing metric labels
- Forgetting to increment counters

**Related Patterns:** add-custom-metrics, observability-custom-metrics

---

## Testing Patterns

### 1. Mock Dependencies in Tests

**Pattern:** Provide test-specific Layer implementations for services.

**When to Use:**

- Unit testing
- Integration testing with controlled dependencies
- Testing error scenarios

**Key Standards:**

```typescript
// ✅ GOOD: Mock layer for testing
const MockDatabase = Layer.succeed(
  Database,
  {
    findUser: (id: string) =>
      id === "1"
        ? Effect.succeed({ id, name: "Test User" })
        : Effect.fail(new NotFoundError({ id }))
  }
)

// Test with mock
const test = Effect.gen(function* () {
  const result = yield* findUser("1")
  expect(result.name).toBe("Test User")
}).pipe(
  Effect.provide(MockDatabase)
)

// ✅ GOOD: Test error scenarios
const FailingDatabase = Layer.succeed(
  Database,
  {
    findUser: () => Effect.fail(new DatabaseError({ cause: "Connection failed" }))
  }
)

// ❌ BAD: Testing with real dependencies
const test = Effect.gen(function* () {
  const result = yield* findUser("1")
  // Using real database - slow, unpredictable, side effects!
}).pipe(
  Effect.provide(LiveDatabase)
)
```

**Common Pitfalls:**

- Testing with live dependencies
- Not testing error scenarios
- Missing type safety in mocks

**Related Patterns:** mocking-dependencies-in-tests, use-default-layer-for-tests

---

### 2. Write Testable HTTP Client Service

**Pattern:** Abstract HTTP calls into a testable service.

**When to Use:**

- Testing code that makes HTTP calls
- Avoiding network calls in tests
- Testing different response scenarios

**Key Standards:**

```typescript
// ✅ GOOD: Testable HTTP service
export class ApiClient extends Effect.Service<ApiClient>()(
  "ApiClient",
  {
    sync: () => ({
      getUser: (id: string) =>
        Http.get(`/users/${id}`).pipe(
          Http.client.execute,
          Effect.flatMap(r => r.json),
          Effect.flatMap(Schema.decode(UserSchema))
        )
    })
  }
) {}

// Mock for tests
const MockApiClient = Layer.succeed(
  ApiClient,
  {
    getUser: (id: string) =>
      Effect.succeed({ id, name: "Mock User" })
  }
)

// ❌ BAD: Direct HTTP calls in business logic
const getUserName = (id: string) =>
  Effect.gen(function* () {
    const response = yield* Http.get(`/users/${id}`)
    // Can't mock easily!
    return response.name
  })
```

**Common Pitfalls:**

- Direct HTTP calls without service abstraction
- Unmockable dependencies
- Tests making real network calls

**Related Patterns:** create-a-testable-http-client-service, model-dependencies-as-services

---

## Stream Processing

### 1. Process Streaming Data with Stream

**Pattern:** Use Stream for data that arrives over time.

**When to Use:**

- Large files
- Paginated APIs
- WebSocket messages
- Event streams

**Key Standards:**

```typescript
// ✅ GOOD: Stream for paginated data
const userStream = Stream.paginateEffect(0, page =>
  fetchPage(page).pipe(
    Effect.map(response => [
      response.users,
      Option.fromNullable(response.nextPage)
    ])
  )
).pipe(
  Stream.flatMap(users => Stream.fromIterable(users))
)

// Process stream
const program = Stream.runForEach(userStream, user =>
  Effect.log(`Processing: ${user.name}`)
)

// ✅ GOOD: Stream transformation
const processedStream = userStream.pipe(
  Stream.map(user => ({ ...user, processed: true })),
  Stream.filter(user => user.age >= 18),
  Stream.take(100)
)

// ❌ BAD: Loading all data into memory
const program = Effect.gen(function* () {
  const allUsers = []
  let page = 0
  while (true) {
    const response = yield* fetchPage(page)
    allUsers.push(...response.users)
    if (!response.nextPage) break
    page = response.nextPage
  }
  // All data in memory!
  return allUsers
})
```

**Common Pitfalls:**

- Loading large datasets into memory
- Manual pagination logic
- Not using streams for naturally streaming data

**Related Patterns:** process-streaming-data-with-stream, stream-from-paginated-api

---

### 2. Stream Resource Management

**Pattern:** Use Stream.acquireRelease for resources in streams.

**When to Use:**

- Reading from files in streams
- Database cursors
- WebSocket connections

**Key Standards:**

```typescript
// ✅ GOOD: Scoped resources in streams
const fileStream = Stream.acquireRelease(
  openFile("data.txt"),
  file => closeFile(file)
).pipe(
  Stream.flatMap(file => Stream.fromEffect(readLine(file)))
)

// ✅ GOOD: Multiple resources
const program = Stream.gen(function* () {
  const db = yield* Stream.scoped(acquireDatabase)
  const cache = yield* Stream.scoped(acquireCache)

  yield* Stream.fromIterable(items).pipe(
    Stream.mapEffect(item => processItem(db, cache, item))
  )
})

// ❌ BAD: Manual resource management
const fileStream = Stream.make(openFile("data.txt")).pipe(
  Stream.map(file => readLine(file))
  // File never closed!
)
```

**Common Pitfalls:**

- Not closing resources in streams
- Resource leaks
- Missing cleanup on stream interruption

**Related Patterns:** stream-manage-resources, stream-from-file

---

### 3. Process Streams Concurrently

**Pattern:** Use Stream.mapEffect with concurrency for parallel processing.

**When to Use:**

- Processing independent stream elements
- Parallel API calls for stream items
- Performance optimization

**Key Standards:**

```typescript
// ✅ GOOD: Concurrent stream processing
const results = userStream.pipe(
  Stream.mapEffect(
    user => enrichUser(user),
    { concurrency: 5 }
  )
)

// ✅ GOOD: Batched processing
const results = dataStream.pipe(
  Stream.grouped(100),
  Stream.mapEffect(
    batch => processBatch(batch),
    { concurrency: 3 }
  )
)

// ❌ BAD: Sequential stream processing
const results = userStream.pipe(
  Stream.mapEffect(user => enrichUser(user))
  // One at a time, very slow!
)
```

**Common Pitfalls:**

- Sequential processing when parallel is possible
- Unbounded concurrency causing resource exhaustion
- Not batching when appropriate

**Related Patterns:** stream-process-concurrently, stream-process-in-batches

---

## Performance & Optimization

### 1. Use Chunk for Performance

**Pattern:** Use Chunk instead of Array for append-heavy operations.

**When to Use:**

- Building large collections
- Stream implementations
- When append performance matters

**Key Standards:**

```typescript
// ✅ GOOD: Chunk for efficient appends
let chunk = Chunk.empty<number>()
for (let i = 0; i < 10000; i++) {
  chunk = Chunk.append(chunk, i) // O(1) amortized
}

// ✅ GOOD: Chunk in streams
const stream = Stream.fromChunk(myChunk)

// ❌ BAD: Array with spread operator
let arr: number[] = []
for (let i = 0; i < 10000; i++) {
  arr = [...arr, i] // O(n) - quadratic time!
}
```

**Common Pitfalls:**

- Using Array for append-heavy operations
- Unnecessary Chunk <-> Array conversions
- Not understanding Chunk's performance characteristics

**Related Patterns:** use-chunk-for-high-performance-collections

---

### 2. Avoid Long andThen Chains

**Pattern:** Use Effect.gen instead of long method chains.

**When to Use:**

- Multi-step workflows
- When readability suffers from chains
- Complex control flow

**Key Standards:**

```typescript
// ✅ GOOD: Effect.gen for readability
const program = Effect.gen(function* () {
  const user = yield* fetchUser(id)
  const posts = yield* fetchPosts(user.id)
  const comments = yield* fetchComments(posts[0].id)
  return { user, posts, comments }
})

// ❌ BAD: Long chains
const program = fetchUser(id).pipe(
  Effect.flatMap(user =>
    fetchPosts(user.id).pipe(
      Effect.flatMap(posts =>
        fetchComments(posts[0].id).pipe(
          Effect.map(comments => ({ user, posts, comments }))
        )
      )
    )
  )
)
```

**Common Pitfalls:**

- Overusing pipe/flatMap for sequential logic
- Callback hell in Effect code
- Poor readability

**Related Patterns:** avoid-long-andthen-chains, use-gen-for-business-logic

---

### 3. Create Reusable Runtime from Layers

**Pattern:** Build a Runtime once and reuse for multiple effects.

**When to Use:**

- Server applications
- Long-running processes
- When you run many effects with same dependencies

**Key Standards:**

```typescript
// ✅ GOOD: Reusable runtime
const AppRuntime = await Effect.runPromise(
  Layer.toRuntime(
    Layer.merge(DatabaseLive, LoggerLive, ConfigLive)
  )
)

// Reuse for many effects
await Runtime.runPromise(AppRuntime)(effect1)
await Runtime.runPromise(AppRuntime)(effect2)

// ✅ GOOD: Managed runtime with cleanup
const program = Effect.scoped(
  Effect.gen(function* () {
    const runtime = yield* Layer.toRuntime(AppLive)

    // Use runtime
    yield* Runtime.runPromise(runtime)(effect1)
    yield* Runtime.runPromise(runtime)(effect2)

    // Automatically cleaned up
  })
)

// ❌ BAD: Building layers repeatedly
for (const item of items) {
  await Effect.runPromise(
    effect.pipe(
      Effect.provide(DatabaseLive),
      Effect.provide(LoggerLive),
      Effect.provide(ConfigLive)
    )
  )
  // Rebuilding all layers each iteration!
}
```

**Common Pitfalls:**

- Rebuilding layers for every effect
- Not reusing runtimes in servers
- Missing cleanup of runtime resources

**Related Patterns:** create-reusable-runtime-from-layers, create-managed-runtime-for-scoped-resources

---

## Common Anti-Patterns Summary

### 1. Mixing Paradigms

- ❌ Using try/catch inside Effect.gen
- ❌ Using async/await with Effect
- ❌ Calling Promise-returning functions without Effect.tryPromise

### 2. Resource Management

- ❌ Manual resource cleanup without scopes
- ❌ Not using acquireRelease for resources
- ❌ Forgetting cleanup on error/interruption

### 3. Error Handling

- ❌ Using generic Error instead of tagged errors
- ❌ Not handling all error types
- ❌ Letting external errors leak into domain layer

### 4. Concurrency

- ❌ Sequential execution when parallel is possible
- ❌ Missing concurrency option in Effect.all
- ❌ Using plain variables for shared state

### 5. Type Safety

- ❌ Type assertions without validation
- ❌ Using any without runtime checks
- ❌ Not using Schema for external data

### 6. Dependencies

- ❌ Direct dependencies instead of services
- ❌ Manual instantiation instead of Layers
- ❌ Testing with live dependencies

### 7. Performance

- ❌ Loading large datasets into memory
- ❌ Array with frequent appends instead of Chunk
- ❌ Rebuilding layers repeatedly

---

## Quick Reference: When to Use What

| Use Case | Pattern | Key Type |
|----------|---------|----------|
| Optional values | Option | `Option<A>` |
| Possible failures | Either | `Either<E, A>` |
| Effectful computation | Effect | `Effect<A, E, R>` |
| Streaming data | Stream | `Stream<A, E, R>` |
| Retry logic | Schedule | `Schedule<In, Out>` |
| Concurrent tasks | Effect.all | `Effect<Array<A>>` |
| Background task | Effect.fork | `Fiber<A, E>` |
| Shared state | Ref | `Ref<A>` |
| Resource cleanup | Scope | `Effect<A, E, R ┃ Scope>` |
| Dependencies | Service + Layer | `Layer<R, E, A>` |
| Validation | Schema | `Schema<A, I, R>` |
| Domain types | Brand | `A & Brand<"Name">` |

---

## Effect-TS Principles

1. **Laziness**: Effects are descriptions, not executions
2. **Type Safety**: Errors, dependencies, and resources in types
3. **Composability**: Small pieces combine into large systems
4. **Resource Safety**: Automatic cleanup, even on error/interruption
5. **Testability**: Services and layers enable easy mocking
6. **Structured Concurrency**: Parent interruption cascades to children
7. **Explicit Everything**: No magic, all effects visible in types

---

## Naming Conventions

- **Services**: PascalCase classes (e.g., `Database`, `HttpClient`)
- **Layers**: ServiceName + "Live"/"Test" (e.g., `DatabaseLive`, `DatabaseTest`)
- **Effects**: camelCase functions returning Effect (e.g., `findUser`)
- **Errors**: PascalCase + "Error" suffix (e.g., `NotFoundError`, `ValidationError`)
- **Schemas**: PascalCase + "Schema" suffix (e.g., `UserSchema`, `ConfigSchema`)

---

## Additional Resources

- Official Effect-TS Documentation: <https://effect.website>
- Effect-TS GitHub: <https://github.com/Effect-TS>
- Community Discord: <https://discord.gg/effect-ts>
- Pattern Repository: <https://github.com/effect-ptrns>

---

End of Effect-TS Standards Document.
