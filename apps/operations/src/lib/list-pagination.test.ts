import assert from "node:assert/strict";
import { test } from "node:test";
import { asPagedList, pageButtons, pageFromSearch, searchWithPage } from "./list-pagination";

test("short lists show every page", () => {
  assert.deepEqual(pageButtons(1, 1), [1]);
  assert.deepEqual(pageButtons(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("long lists keep first, last and the current page's neighbours, in seven slots or fewer", () => {
  assert.deepEqual(pageButtons(1, 20), [1, 2, 3, 4, 5, "gap", 20]);
  assert.deepEqual(pageButtons(10, 20), [1, "gap", 9, 10, 11, "gap", 20]);
  assert.deepEqual(pageButtons(20, 20), [1, "gap", 16, 17, 18, 19, 20]);
  for (let current = 1; current <= 40; current += 1) {
    const buttons = pageButtons(current, 40);
    assert.ok(buttons.length <= 7, `page ${current} shows ${buttons.length} slots`);
    assert.ok(buttons.includes(current));
    assert.equal(buttons[0], 1);
    assert.equal(buttons.at(-1), 40);
  }
});

test("an out-of-range current page is pulled back inside the list", () => {
  assert.deepEqual(pageButtons(99, 3), [1, 2, 3]);
  assert.deepEqual(pageButtons(0, 0), [1]);
});

test("the page is read from and written to the address bar", () => {
  assert.equal(pageFromSearch("?page=3&status=all"), 3);
  assert.equal(pageFromSearch("?page=abc"), 1);
  assert.equal(pageFromSearch("?page=-2"), 1);
  assert.equal(pageFromSearch(""), 1);
  assert.equal(searchWithPage("?status=packed", 4), "?status=packed&page=4");
  assert.equal(searchWithPage("?status=packed&page=4", 1), "?status=packed");
  assert.equal(searchWithPage("?page=4", 1), "");
});

test("a plain array from an older API reads as one page", () => {
  assert.deepEqual(asPagedList([1, 2, 3]), { items: [1, 2, 3], total: 3, page: 1, pageSize: 30, pageCount: 1 });
  const paged = { items: [1], total: 31, page: 2, pageSize: 30, pageCount: 2 };
  assert.equal(asPagedList(paged), paged);
});
