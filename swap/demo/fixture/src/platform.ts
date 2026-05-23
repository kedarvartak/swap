// E-Commerce Platform — monolithic service layer
// 10 agents will each own a slice of this file via SWAP symbol claims

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "customer" | "vendor";
  createdAt: Date;
  lastLogin?: Date;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  vendorId: string;
  category: string;
  tags: string[];
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  total: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  method: "card" | "wallet" | "bank_transfer";
  status: "pending" | "completed" | "failed" | "refunded";
  gateway: string;
  gatewayRef?: string;
  failureReason?: string;
  refundAmount?: number;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: "order_update" | "payment" | "promo" | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Cart {
  userId: string;
  items: CartItem[];
  updatedAt: Date;
}

export interface Coupon {
  code: string;
  discountPct: number;
  maxUses: number;
  usedCount: number;
  expiresAt: Date;
}

export interface InventoryEvent {
  productId: string;
  delta: number;
  reason: "sale" | "restock" | "adjustment" | "return";
  timestamp: Date;
}

export interface SearchResult {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AnalyticsEvent {
  event: string;
  userId?: string;
  properties: Record<string, unknown>;
  timestamp: Date;
}

// ─── In-memory stores (stand-ins for real DB) ─────────────────────────────────

const users = new Map<string, User>();
const products = new Map<string, Product>();
const orders = new Map<string, Order>();
const payments = new Map<string, Payment>();
const notifications: Notification[] = [];
const reviews = new Map<string, Review[]>();
const carts = new Map<string, Cart>();
const coupons = new Map<string, Coupon>();
const inventoryLog: InventoryEvent[] = [];
const analyticsQueue: AnalyticsEvent[] = [];

// ─── Agent 1 — User Management ────────────────────────────────────────────────

const VALID_ROLES: ReadonlySet<User["role"]> = new Set(["admin", "customer", "vendor"]);

// SWAP: broadcast_intent — adding input validation to createUser, updateUser,
//       deleteUser (active-order guard), listUsers (limit param),
//       getUserById, getUserByEmail, recordUserLogin
// SWAP: claim_symbol createUser (write)
export function createUser(email: string, name: string, role: User["role"] = "customer"): User {
  if (!email.includes("@")) throw new Error("Invalid email: must contain @");
  if (!name.trim()) throw new Error("name must be non-empty");
  if (!VALID_ROLES.has(role)) throw new Error(`Invalid role: must be one of ${[...VALID_ROLES].join(", ")}`);
  const user: User = {
    id: `user_${Date.now()}`,
    email,
    name,
    role,
    createdAt: new Date(),
  };
  users.set(user.id, user);
  return user;
}

// SWAP: claim_symbol getUserById (read)
export function getUserById(id: string): User | undefined {
  return users.get(id);
}

// SWAP: claim_symbol getUserByEmail (read)
export function getUserByEmail(email: string): User | undefined {
  for (const u of users.values()) {
    if (u.email === email) return u;
  }
  return undefined;
}

// SWAP: claim_symbol updateUser (write)
export function updateUser(id: string, patch: Partial<Pick<User, "name" | "email" | "role">>): User {
  const user = users.get(id);
  if (!user) throw new Error(`User ${id} not found`);
  if (patch.email !== undefined && !patch.email.includes("@")) {
    throw new Error("Invalid email: must contain @");
  }
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error("name must be non-empty");
  }
  if (patch.role !== undefined && !VALID_ROLES.has(patch.role)) {
    throw new Error(`Invalid role: must be one of ${[...VALID_ROLES].join(", ")}`);
  }
  Object.assign(user, patch);
  return user;
}

// SWAP: claim_symbol deleteUser (write)
export function deleteUser(id: string): void {
  if (!users.has(id)) throw new Error(`User ${id} not found`);
  const activeOrders = Array.from(orders.values()).filter(
    (o) => o.userId === id && o.status !== "cancelled" && o.status !== "delivered"
  );
  if (activeOrders.length > 0) {
    throw new Error(`Cannot delete user ${id}: has ${activeOrders.length} active order(s)`);
  }
  users.delete(id);
}

// SWAP: claim_symbol listUsers (write)
export function listUsers(role?: User["role"], limit?: number): User[] {
  let result = Array.from(users.values());
  if (role) result = result.filter((u) => u.role === role);
  if (limit !== undefined && limit >= 0) result = result.slice(0, limit);
  return result;
}

// SWAP: claim_symbol recordUserLogin (write)
export function recordUserLogin(id: string): void {
  const user = users.get(id);
  if (!user) throw new Error(`User ${id} not found`);
  user.lastLogin = new Date();
}

// ─── Agent 2 — Product Catalog ────────────────────────────────────────────────

// SWAP: claim_symbol createProduct (write)
export function createProduct(data: Omit<Product, "id">): Product {
  if (!data.name.trim()) throw new Error("Product name must be non-empty");
  if (!data.category.trim()) throw new Error("Product category must be non-empty");
  if (data.price <= 0) throw new Error("Product price must be greater than 0");
  if (data.stock < 0) throw new Error("Product stock must be >= 0");
  const product: Product = { id: `prod_${Date.now()}`, ...data };
  products.set(product.id, product);
  return product;
}

// SWAP: claim_symbol getProductById (read)
export function getProductById(id: string): Product | undefined {
  return products.get(id);
}

// SWAP: claim_symbol updateProduct (write)
export function updateProduct(id: string, patch: Partial<Omit<Product, "id">>): Product {
  const product = products.get(id);
  if (!product) throw new Error(`Product ${id} not found`);
  if (patch.price !== undefined && patch.price <= 0) {
    throw new Error("Product price must be greater than 0");
  }
  if (patch.stock !== undefined && patch.stock < 0) {
    throw new Error("Product stock must be >= 0");
  }
  Object.assign(product, patch);
  return product;
}

// SWAP: claim_symbol deleteProduct (write)
export function deleteProduct(id: string): void {
  if (!products.has(id)) throw new Error(`Product ${id} not found`);
  const activeOrders = Array.from(orders.values()).filter(
    (o) =>
      o.status !== "cancelled" &&
      o.status !== "delivered" &&
      o.items.some((i) => i.productId === id)
  );
  if (activeOrders.length > 0) {
    throw new Error(`Cannot delete product ${id}: referenced by ${activeOrders.length} active order(s)`);
  }
  products.delete(id);
}

// SWAP: claim_symbol listProductsByVendor (write)
export function listProductsByVendor(vendorId: string, sortBy?: "price" | "stock" | "name"): Product[] {
  const result = Array.from(products.values()).filter((p) => p.vendorId === vendorId);
  if (sortBy === "price") result.sort((a, b) => a.price - b.price);
  else if (sortBy === "stock") result.sort((a, b) => a.stock - b.stock);
  else if (sortBy === "name") result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

// SWAP: claim_symbol listProductsByCategory (write)
export function listProductsByCategory(category: string, sortBy?: "price" | "stock" | "name"): Product[] {
  const result = Array.from(products.values()).filter((p) => p.category === category);
  if (sortBy === "price") result.sort((a, b) => a.price - b.price);
  else if (sortBy === "stock") result.sort((a, b) => a.stock - b.stock);
  else if (sortBy === "name") result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

// SWAP: claim_symbol getProductsByIds (write)
export function getProductsByIds(ids: string[]): Product[] {
  const result: Product[] = [];
  for (const id of ids) {
    const p = products.get(id);
    if (p) result.push(p);
  }
  return result;
}

// ─── Agent 3 — Order Processing ───────────────────────────────────────────────

export const ORDER_STATUS_TRANSITIONS: Record<Order["status"], Order["status"][]> = {
  pending:   ["confirmed", "cancelled"],
  confirmed: ["shipped",   "cancelled"],
  shipped:   ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function createOrder(userId: string, items: OrderItem[]): Order {
  if (!items || items.length === 0) throw new Error("Order must contain at least one item");
  for (const item of items) {
    if (item.quantity <= 0) throw new Error(`Item quantity must be > 0 (got ${item.quantity})`);
    if (item.unitPrice <= 0) throw new Error(`Item unitPrice must be > 0 (got ${item.unitPrice})`);
  }
  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const order: Order = {
    id: `order_${Date.now()}`,
    userId,
    items,
    status: "pending",
    total,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  orders.set(order.id, order);
  return order;
}

export function getOrderById(id: string): Order | undefined {
  return orders.get(id);
}

export function updateOrderStatus(id: string, status: Order["status"]): Order {
  const order = orders.get(id);
  if (!order) throw new Error(`Order ${id} not found`);
  const allowed = ORDER_STATUS_TRANSITIONS[order.status];
  if (!allowed.includes(status)) {
    throw new Error(
      `Invalid status transition: ${order.status} → ${status}. ` +
      `Allowed: ${allowed.length ? allowed.join(", ") : "none"}`
    );
  }
  order.status = status;
  order.updatedAt = new Date();
  return order;
}

export function getOrdersByUser(userId: string, status?: Order["status"]): Order[] {
  const userOrders = Array.from(orders.values()).filter((o) => o.userId === userId);
  return status ? userOrders.filter((o) => o.status === status) : userOrders;
}

export function cancelOrder(id: string, force = false): Order {
  const order = orders.get(id);
  if (!order) throw new Error(`Order ${id} not found`);
  if (order.status === "delivered") throw new Error("Cannot cancel a delivered order");
  if (order.status === "shipped" && !force) {
    throw new Error("Cannot cancel a shipped order without force flag");
  }
  order.status = "cancelled";
  order.updatedAt = new Date();
  return order;
}

export function calculateOrderTotal(items: OrderItem[], discountPct = 0): number {
  const raw = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  if (discountPct < 0 || discountPct > 100) throw new Error("discountPct must be between 0 and 100");
  return raw * (1 - discountPct / 100);
}

// ─── Agent 4 — Payment Processing ────────────────────────────────────────────

export function initiatePayment(orderId: string, method: Payment["method"], currency = "USD"): Payment {
  const order = orders.get(orderId);
  if (!order) throw new Error(`Order ${orderId} not found`);

  const existing = Array.from(payments.values()).find(
    (p) => p.orderId === orderId && (p.status === "pending" || p.status === "completed")
  );
  if (existing) throw new Error(`Order ${orderId} already has an active payment (${existing.id})`);

  const payment: Payment = {
    id: `pay_${Date.now()}`,
    orderId,
    amount: order.total,
    currency,
    method,
    status: "pending",
    gateway: selectGateway(method),
    createdAt: new Date(),
  };
  payments.set(payment.id, payment);
  return payment;
}

export function confirmPayment(paymentId: string, gatewayRef: string): Payment {
  const payment = payments.get(paymentId);
  if (!payment) throw new Error(`Payment ${paymentId} not found`);
  if (typeof gatewayRef !== "string" || gatewayRef.trim() === "") {
    throw new Error("gatewayRef must be a non-empty string");
  }
  payment.status = "completed";
  payment.gatewayRef = gatewayRef;
  return payment;
}

export function failPayment(paymentId: string, reason?: string): Payment {
  const payment = payments.get(paymentId);
  if (!payment) throw new Error(`Payment ${paymentId} not found`);
  payment.status = "failed";
  if (reason !== undefined) payment.failureReason = reason;
  return payment;
}

export function refundPayment(paymentId: string, amount?: number): Payment {
  const payment = payments.get(paymentId);
  if (!payment) throw new Error(`Payment ${paymentId} not found`);
  if (payment.status !== "completed") throw new Error("Only completed payments can be refunded");
  const refund = amount ?? payment.amount;
  if (refund <= 0 || refund > payment.amount) {
    throw new Error(`Refund amount must be between 0 and ${payment.amount}`);
  }
  payment.status = "refunded";
  payment.refundAmount = refund;
  return payment;
}

export function getPaymentsByOrder(orderId: string, status?: Payment["status"]): Payment[] {
  const all = Array.from(payments.values()).filter((p) => p.orderId === orderId);
  return status ? all.filter((p) => p.status === status) : all;
}

export function selectGateway(method: Payment["method"] | string): string {
  const gateways: Record<Payment["method"], string> = {
    card: "stripe",
    wallet: "paypal",
    bank_transfer: "plaid",
  };
  return (gateways as Record<string, string>)[method] ?? "manual";
}

// ─── Agent 5 — Inventory Management ──────────────────────────────────────────

const MAX_STOCK = 10000;

export function adjustInventory(productId: string, delta: number, reason: InventoryEvent["reason"]): void {
  const product = products.get(productId);
  if (!product) throw new Error(`Product ${productId} not found`);
  if (product.stock + delta < 0) throw new Error("Insufficient stock");
  if (product.stock + delta > MAX_STOCK) throw new Error(`Stock cannot exceed ${MAX_STOCK}`);
  product.stock += delta;
  if (product.stock < 5) console.warn(`Low stock warning: product ${productId} has ${product.stock} units remaining`);
  inventoryLog.push({ productId, delta, reason, timestamp: new Date() });
}

export function reserveStock(productId: string, quantity: number): void {
  const product = products.get(productId);
  if (!product) throw new Error(`Product ${productId} not found`);
  if (product.stock < quantity) throw new Error(`Insufficient stock for product ${productId}: requested ${quantity}, available ${product.stock}`);
  adjustInventory(productId, -quantity, "sale");
}

export function restockProduct(productId: string, quantity: number): void {
  if (quantity <= 0) throw new Error("Restock quantity must be greater than 0");
  adjustInventory(productId, quantity, "restock");
}

export function getInventoryHistory(productId: string, start?: Date, end?: Date): InventoryEvent[] {
  return inventoryLog.filter((e) => {
    if (e.productId !== productId) return false;
    if (start && e.timestamp < start) return false;
    if (end && e.timestamp > end) return false;
    return true;
  });
}

export function getLowStockProducts(threshold = 10): Product[] {
  return Array.from(products.values()).filter((p) => p.stock === 0 || p.stock <= threshold);
}

export function bulkRestock(updates: { productId: string; quantity: number }[]): void {
  const errors: string[] = [];
  for (const { productId, quantity } of updates) {
    try {
      restockProduct(productId, quantity);
    } catch (err) {
      errors.push(`${productId}: ${(err as Error).message}`);
    }
  }
  if (errors.length > 0) throw new Error(`Bulk restock failed for ${errors.length} product(s):\n${errors.join("\n")}`);
}

// ─── Agent 6 — Cart & Checkout ────────────────────────────────────────────────

export function getCart(userId: string): Cart {
  return carts.get(userId) ?? { userId, items: [], updatedAt: new Date() };
}

export function addToCart(userId: string, productId: string, quantity: number): Cart {
  const cart = getCart(userId);
  const existing = cart.items.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.push({ productId, quantity });
  }
  cart.updatedAt = new Date();
  carts.set(userId, cart);
  return cart;
}

export function removeFromCart(userId: string, productId: string): Cart {
  const cart = getCart(userId);
  cart.items = cart.items.filter((i) => i.productId !== productId);
  cart.updatedAt = new Date();
  carts.set(userId, cart);
  return cart;
}

export function clearCart(userId: string): void {
  carts.delete(userId);
}

export function checkoutCart(userId: string, method: Payment["method"]): { order: Order; payment: Payment } {
  const cart = getCart(userId);
  if (cart.items.length === 0) throw new Error("Cart is empty");
  const items: OrderItem[] = cart.items.map((ci) => {
    const product = products.get(ci.productId);
    if (!product) throw new Error(`Product ${ci.productId} not found`);
    return { productId: ci.productId, quantity: ci.quantity, unitPrice: product.price };
  });
  const order = createOrder(userId, items);
  const payment = initiatePayment(order.id, method);
  clearCart(userId);
  return { order, payment };
}

// ─── Agent 7 — Notifications ──────────────────────────────────────────────────

export function sendNotification(userId: string, type: Notification["type"], title: string, body: string): Notification {
  const notification: Notification = {
    id: `notif_${Date.now()}`,
    userId,
    type,
    title,
    body,
    read: false,
    createdAt: new Date(),
  };
  notifications.push(notification);
  return notification;
}

export function getNotifications(userId: string, unreadOnly = false): Notification[] {
  const userNotifs = notifications.filter((n) => n.userId === userId);
  return unreadOnly ? userNotifs.filter((n) => !n.read) : userNotifs;
}

export function markNotificationRead(id: string): void {
  const notif = notifications.find((n) => n.id === id);
  if (!notif) throw new Error(`Notification ${id} not found`);
  notif.read = true;
}

export function markAllNotificationsRead(userId: string): void {
  notifications.filter((n) => n.userId === userId && !n.read).forEach((n) => { n.read = true; });
}

export function deleteNotification(id: string): void {
  const idx = notifications.findIndex((n) => n.id === id);
  if (idx === -1) throw new Error(`Notification ${id} not found`);
  notifications.splice(idx, 1);
}

// ─── Agent 8 — Reviews & Ratings ─────────────────────────────────────────────

export function submitReview(productId: string, userId: string, rating: number, comment: string): Review {
  if (rating < 1 || rating > 5) throw new Error("Rating must be between 1 and 5");
  const review: Review = {
    id: `rev_${Date.now()}`,
    productId,
    userId,
    rating,
    comment,
    createdAt: new Date(),
  };
  const existing = reviews.get(productId) ?? [];
  existing.push(review);
  reviews.set(productId, existing);
  return review;
}

export function getProductReviews(productId: string): Review[] {
  return reviews.get(productId) ?? [];
}

export function getAverageRating(productId: string): number {
  const productReviews = getProductReviews(productId);
  if (productReviews.length === 0) return 0;
  return productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length;
}

export function deleteReview(productId: string, reviewId: string): void {
  const productReviews = reviews.get(productId) ?? [];
  const idx = productReviews.findIndex((r) => r.id === reviewId);
  if (idx === -1) throw new Error(`Review ${reviewId} not found`);
  productReviews.splice(idx, 1);
  reviews.set(productId, productReviews);
}

export function getUserReviews(userId: string): Review[] {
  const all: Review[] = [];
  for (const productReviews of reviews.values()) {
    all.push(...productReviews.filter((r) => r.userId === userId));
  }
  return all;
}

// ─── Agent 9 — Coupons & Discounts ───────────────────────────────────────────

export function createCoupon(code: string, discountPct: number, maxUses: number, expiresAt: Date): Coupon {
  if (coupons.has(code)) throw new Error(`Coupon ${code} already exists`);
  const coupon: Coupon = { code, discountPct, maxUses, usedCount: 0, expiresAt };
  coupons.set(code, coupon);
  return coupon;
}

export function validateCoupon(code: string): Coupon {
  const coupon = coupons.get(code);
  if (!coupon) throw new Error(`Coupon ${code} not found`);
  if (coupon.usedCount >= coupon.maxUses) throw new Error("Coupon usage limit reached");
  if (new Date() > coupon.expiresAt) throw new Error("Coupon has expired");
  return coupon;
}

export function applyCoupon(code: string, total: number): number {
  const coupon = validateCoupon(code);
  coupon.usedCount++;
  return total * (1 - coupon.discountPct / 100);
}

export function deactivateCoupon(code: string): void {
  const coupon = coupons.get(code);
  if (!coupon) throw new Error(`Coupon ${code} not found`);
  coupon.maxUses = coupon.usedCount;
}

export function listActiveCoupons(): Coupon[] {
  const now = new Date();
  return Array.from(coupons.values()).filter((c) => c.usedCount < c.maxUses && c.expiresAt > now);
}

// ─── Agent 10 — Search & Analytics ───────────────────────────────────────────

export function searchProducts(query: string, category?: string, page = 1, pageSize = 20): SearchResult {
  let results = Array.from(products.values()).filter((p) => {
    const matchesQuery =
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.description.toLowerCase().includes(query.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()));
    const matchesCategory = !category || p.category === category;
    return matchesQuery && matchesCategory;
  });
  const total = results.length;
  results = results.slice((page - 1) * pageSize, page * pageSize);
  return { products: results, total, page, pageSize };
}

export function trackEvent(event: string, userId?: string, properties: Record<string, unknown> = {}): void {
  analyticsQueue.push({ event, userId, properties, timestamp: new Date() });
}

export function getTopProducts(limit = 10): Product[] {
  const salesCount = new Map<string, number>();
  for (const order of orders.values()) {
    for (const item of order.items) {
      salesCount.set(item.productId, (salesCount.get(item.productId) ?? 0) + item.quantity);
    }
  }
  return Array.from(salesCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => products.get(id))
    .filter(Boolean) as Product[];
}

export function getRevenueByPeriod(start: Date, end: Date): number {
  return Array.from(payments.values())
    .filter((p) => p.status === "completed" && p.createdAt >= start && p.createdAt <= end)
    .reduce((sum, p) => sum + p.amount, 0);
}

export function getUserEngagementStats(userId: string): { orders: number; reviews: number; totalSpent: number } {
  const userOrders = getOrdersByUser(userId);
  const userReviews = getUserReviews(userId);
  const totalSpent = userOrders.reduce((sum, o) => sum + o.total, 0);
  return { orders: userOrders.length, reviews: userReviews.length, totalSpent };
}

export function flushAnalytics(): AnalyticsEvent[] {
  return analyticsQueue.splice(0, analyticsQueue.length);
}
