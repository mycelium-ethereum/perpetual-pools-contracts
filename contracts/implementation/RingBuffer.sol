// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

library RingBuffer {
    /* Represents a ring buffer */
    struct RB_RingBuffer {
        int256[] xs;       /* elements */
        uint256 n;          /* maximum number of elements */
        uint256 read;       /* read offset (next read will occur from here) */
        uint256 write;      /* write offset (next write will occur here) */
    }
    
    /**
     * @notice Initialises a new ring buffer instance
     * @param length Maximum length of the new ring buffer
     * @return Ring buffer of specified maximum length
     */
    function init(uint256 length) public pure returns (RB_RingBuffer memory) {
        return RB_RingBuffer(new int256[](length), length, 0, 0);
    }

    /**
     * @notice Appends a new element to the provided ring buffer
     * @param buf Old ring buffer
     * @param x New element to append
     * @return New ring buffer with appropriate changes made
     * @dev In the case of fullness, oldest data is overwritten first
     * @dev Time complexity of `O(1)`
     * @dev Time complexity of `O(n)` (due to array copy)
     */
    function push(
        RB_RingBuffer memory buf,
        int256 x
    ) public pure returns (RB_RingBuffer memory) {
        /* new fields */
        int256[] memory elems;
        uint256 n;
        uint256 read;
        uint256 write;

        /* copy old elements */
        elems = buf.xs;

        /* handle full condition */
        if (buf.write == buf.n) {
            write = 1;

            /* insert new element */
            elems[0] = x;
        } else {
            write = buf.write + 1;

            /* insert new element */
            elems[write] = x;
        }

        /* other fields remain unchanged */
        n = buf.n;
        read = buf.read;

        /* construct new RingBuffer instance */
        return RB_RingBuffer(elems, n, read, write);
    } 

    /**
     * @notice Retrieves the oldest element from the ring buffer and removes it
     * @param buf Ring buffer to read from
     * @return New ring buffer and (previously) oldest element
     * @dev Reverts if the ring buffer is exhausted
     * @dev Time complexity of `O(1)`
     * @dev Space complexity of `O(n)` (due to array copy)
     */
    function pop(
        RB_RingBuffer memory buf
    ) public pure returns (
        RB_RingBuffer memory,
        int256
    ) {
        /* new fields */
        int256[] memory elems;
        uint256 n;
        uint256 read;
        uint256 write;

        if (buf.read == buf.write) { /* handle empty buffer */
            revert();
        } else {
            elems = buf.xs;
            n = buf.n;
            read = buf.read + 1;
            write = buf.write;
        }

        return (RB_RingBuffer(elems, n, read, write), buf.xs[read - 1]);
    }

    /**
     * @notice Determines if two ring buffers are equal
     * @param a Ring buffer
     * @param b Ring buffer
     * @return Boolean indicating equality
     * @dev Time complexity of `O(n)` (due to linear scan over the elements
     *      arrays)
     * @dev Space complexity of `O(1)`
     */
    function eq(
        RB_RingBuffer memory a,
        RB_RingBuffer memory b
    ) public pure returns (bool) {
        bool n_eq = a.n == b.n;
        bool read_eq = a.read == b.read;
        bool write_eq = a.write == b.write;

        /* bounds check here prior to loop! */
        if (!n_eq) {
            return false;
        }

        bool xs_eq = true;

        /* linear scan over elements on either side to check equality of the
         * arrays */
        for (uint256 i=0;i<a.n;i++) {
            if (a.xs[i] != b.xs[i]) {
                xs_eq = false;
                break;
            }
        }

        return xs_eq && n_eq && read_eq && write_eq;
    }
}

