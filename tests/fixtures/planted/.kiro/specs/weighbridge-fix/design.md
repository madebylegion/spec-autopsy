# Design Document

## Overview

Planted fixture bugfix design. Not part of the real project.

The fix is one function, `zeroBelowFloor`, in `src/weighbridge.ts`. It returns zero for a reading under the noise floor and the reading itself otherwise.

Cases live in `tests/weighbridge.test.ts`.
