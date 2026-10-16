CREATE TABLE customers (
  customer_id integer PRIMARY KEY,
  customer_name text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  created_at date NOT NULL
);

CREATE TABLE products (
  product_id integer PRIMARY KEY,
  product_name text NOT NULL,
  category text NOT NULL,
  unit_price numeric(10, 2) NOT NULL
);

CREATE TABLE orders (
  order_id integer PRIMARY KEY,
  customer_id integer REFERENCES customers(customer_id),
  order_date date NOT NULL,
  status text NOT NULL,
  shipping_note text,
  total_amount numeric(10, 2) NOT NULL
);

CREATE TABLE order_items (
  order_item_id integer PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(order_id),
  product_id integer NOT NULL REFERENCES products(product_id),
  quantity integer NOT NULL,
  unit_price numeric(10, 2) NOT NULL
);

CREATE TABLE event_log (
  event_id integer PRIMARY KEY,
  customer_id integer NOT NULL,
  event_type text NOT NULL,
  created_at date NOT NULL
);

INSERT INTO customers VALUES
  (1, 'Asha Rao', 'Bengaluru', 'Karnataka', '2025-11-03'),
  (2, 'Kabir Shah', 'Mumbai', 'Maharashtra', '2025-11-14'),
  (3, 'Meera Nair', 'Kochi', 'Kerala', '2025-12-02'),
  (4, 'Arjun Das', 'Kolkata', 'West Bengal', '2025-12-11'),
  (5, 'Sara Khan', 'Hyderabad', 'Telangana', '2026-01-08'),
  (6, 'Dev Patel', 'Ahmedabad', 'Gujarat', '2026-01-19');

INSERT INTO products VALUES
  (1, 'Filter coffee', 'Beverages', 180.00),
  (2, 'Steel lunch box', 'Kitchen', 640.00),
  (3, 'Cotton tote', 'Accessories', 220.00),
  (4, 'Masala chai', 'Beverages', 150.00),
  (5, 'Notebook set', 'Stationery', 275.00);

INSERT INTO orders VALUES
  (101, 1, '2026-01-04', 'delivered', 'Leave with security', 820.00),
  (102, 2, '2026-01-06', 'delivered', NULL, 450.00),
  (103, 1, '2026-01-12', 'shipped', NULL, 640.00),
  (104, 3, '2026-01-13', 'delivered', 'Call on arrival', 550.00),
  (105, 4, '2026-01-19', 'cancelled', NULL, 220.00),
  (106, 2, '2026-01-21', 'delivered', NULL, 915.00),
  (107, 5, '2026-02-02', 'shipped', 'Gate code 18', 790.00),
  (108, 1, '2026-02-05', 'delivered', NULL, 370.00),
  (109, 3, '2026-02-11', 'delivered', NULL, 1280.00),
  (110, 4, '2026-02-14', 'returned', 'Pickup requested', 640.00),
  (111, 5, '2026-02-20', 'delivered', NULL, 330.00),
  (112, 2, '2026-02-23', 'processing', NULL, 825.00);

INSERT INTO order_items VALUES
  (1, 101, 1, 1, 180.00), (2, 101, 2, 1, 640.00),
  (3, 102, 4, 3, 150.00),
  (4, 103, 2, 1, 640.00),
  (5, 104, 3, 1, 220.00), (6, 104, 5, 1, 275.00), (7, 104, 4, 1, 150.00),
  (8, 105, 3, 1, 220.00),
  (9, 106, 5, 1, 275.00), (10, 106, 2, 1, 640.00),
  (11, 107, 1, 2, 180.00), (12, 107, 2, 1, 430.00),
  (13, 108, 4, 1, 150.00), (14, 108, 5, 1, 220.00),
  (15, 109, 2, 2, 640.00),
  (16, 110, 2, 1, 640.00),
  (17, 111, 3, 1, 220.00), (18, 111, 1, 1, 110.00),
  (19, 112, 2, 1, 640.00), (20, 112, 4, 1, 150.00);

INSERT INTO event_log (event_id, customer_id, event_type, created_at)
SELECT event_id, (event_id % 500) + 1,
       CASE event_id % 3 WHEN 0 THEN 'view' WHEN 1 THEN 'cart' ELSE 'purchase' END,
       DATE '2026-01-01' + (event_id % 60)
FROM generate_series(1, 5000) AS event_id;
