# Common mistake

Returning the stored record directly leaks secrets such as `password`. Use a separate response model so only intended fields leave the API.
