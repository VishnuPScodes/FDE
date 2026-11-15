# Common mistake

Reading the limit without a lower bound, or ignoring it and returning every item. Declare the query parameter with a default and `ge=1` so FastAPI validates it and returns 422 for bad values.
