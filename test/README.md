# Testing Guidelines #

## Rationale ##

Testing is a necessary aspect of any software development process. There are
many ways to describe the quality of a test suite (both quantitative and
qualitative). In addition to these properties, a high quality test suite still
necessitates clear and coherent organisation.

This document aims to clarify how we conduct testing in the Perpetual Pools
system and act as a procedural guide for how to write additional tests when
contributing to the codebase. Specifically, this document aims to address the
following questions:

 - How should tests be laid out? File-per-contract, etc.
 - What testing frameworks do we use?
 - How should the tests themselves look?

## Test Suite Structure ##

### All Tests Under `test` ###

All tests -- regardless of their type (e.g., unit, integration, etc.) -- must
reside under the `test` directory.

### One-File-One-Contract ###

All unit tests should be arranged such that all tests for a given module are in
the same file. The most obvious choice for what constitutes a "module" is a
smart contract.

For example, if the (fictional) contract `PermissionedDeployer` is being added
to the codebase, its unit tests should reside in a file called
`PermissionedDeployer.spec.ts` under the `test` directory.

## Test Layout ##

### Use BDD Testing Nomenclature ###

Perpetual Pools uses [Mocha](https://mochajs.org) as its testing framework.
Broadly speaking, Mocha exposes three different primitives for writing tests:

 - `describe`
    - Used to *describe* a given component of the system being tested
    - Can be nested
 - `context`
    - Used to describe the situation being considered
 - `it`
    - Used to make an assertion about the behaviour of the system

Additionally, the ability to nest these primitives must be used eagerly. For
example,

```typescript
describe("PermissionedDeployer", async () => {
    describe("get", async () => {
        context("When called with an offset less than zero", async () => {
            it("Reverts", async () => {
                let negativeOffset: BigNumberish = -1;
                await expect(permissionedDeployer.get(negativeOffset)).to.be.revertedWith("PD: Offset must be non-negative")
            })
        })

        context("When called with an offset equal to zero", async () => {
            it("Reverts", async () => {
                let zeroOffset: BigNumberish = 0
                let expectedResult: BigNumberish = 100 /* arbitrary */

                expect(await permissionedDeployer.get(zeroOffset)).to.eq(expectedResult)
            })
        })
    })
})
```

### Test Messages Are Specific ###

Human-readable test messages must be clear, accurate, and specific. Some words
essentially should never appear in these messages. For example:

 - "properly"
 - "correctly"
 - "appropriately"

The issue with these words in this context is that they obscure what the actual
desired behaviour of the system is (it's obvious that a given function call
must execute correctly -- what does this actually mean?).

## Miscellaneous ##

### All Tests Are Written In Typescript ###

All tests are written in Typescript.

### All Tests Are Asynchronous ###

All tests must be written using asynchronous, anonymous functions.

For example, the following block tests that the (fictional)
`PermissionedDeployer.get` function reverts when provided with an offset less
than zero:

```typescript
describe("PermissionedDeployer", async () => {
    describe("get", async () => {
        context("When called with an offset less than zero", async () => {
            it("Reverts", async () => {
                let negativeOffset: BigNumberish = -1;
                await expect(permissionedDeployer.get(negativeOffset)).to.be.revertedWith("PD: Offset must be non-negative")
            })
        })
    })
})
```

Note how each nested block is both:

 - Wrapped anonymously
 - `async`

