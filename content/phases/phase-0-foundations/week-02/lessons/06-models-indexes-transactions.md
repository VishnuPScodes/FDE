# Model, index, and change data safely

In a normalized model, each fact has one home and relationships use keys. A star schema keeps facts in a central table and descriptive attributes in dimension tables. Both choices trade storage, update safety, and query simplicity.

An index can speed up a selective lookup, but it takes storage and makes writes more expensive. Use `EXPLAIN` to see the plan PostgreSQL chose. A sequential scan can be the right plan for a small table or a query that reads most of it.

Transactions group changes into one unit. `BEGIN` starts a transaction, `COMMIT` keeps its changes, and `ROLLBACK` discards them. Validate the rows you plan to change before committing.
