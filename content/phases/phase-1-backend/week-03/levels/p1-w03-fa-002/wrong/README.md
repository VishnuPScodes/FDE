# Common mistake

Returning an empty object for every path parameter can make the route look successful while returning the wrong resource. Check whether the requested ID exists and use a real 404 response for missing items.
