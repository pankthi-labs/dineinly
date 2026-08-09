CREATE TYPE "public"."actor_type" AS ENUM('staff', 'guest');--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('available', 'sold_out');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('open', 'requested', 'settled');--> statement-breakpoint
CREATE TYPE "public"."diet" AS ENUM('veg', 'non_veg');--> statement-breakpoint
CREATE TYPE "public"."ice" AS ENUM('none', 'less', 'regular');--> statement-breakpoint
CREATE TYPE "public"."menu_category_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."menu_item_prep_time" AS ENUM('5-10 mins', '10-15 mins', '15-20 mins', '20-30 mins', '30-45 mins');--> statement-breakpoint
CREATE TYPE "public"."menu_item_serving_size" AS ENUM('serves 1', 'serves 1-2', 'serves 2', 'serves 2-3', 'serves 4-5', 'serves 5+');--> statement-breakpoint
CREATE TYPE "public"."menu_item_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."order_item_status" AS ENUM('placed', 'preparing', 'ready', 'served', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."restaurant_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."salt" AS ENUM('less salt', 'regular');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."spice" AS ENUM('mild', 'regular', 'extra spicy');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('waiter', 'kitchen', 'manager', 'owner');--> statement-breakpoint
CREATE TYPE "public"."staff_status" AS ENUM('invited', 'active', 'removed');--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"status" "bill_status" DEFAULT 'open' NOT NULL,
	"service_charge_rate" numeric(5, 4),
	"subtotal" numeric(12, 2),
	"tax_amount" numeric(12, 2),
	"service_charge_amount" numeric(12, 2),
	"total" numeric(12, 2),
	"settled_at" timestamp with time zone,
	"settled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_session_id_unique" UNIQUE("session_id"),
	CONSTRAINT "bills_service_charge_rate_check" CHECK ("bills"."service_charge_rate" between 0 and 1),
	CONSTRAINT "bills_subtotal_check" CHECK ("bills"."subtotal" >= 0),
	CONSTRAINT "bills_tax_amount_check" CHECK ("bills"."tax_amount" >= 0),
	CONSTRAINT "bills_service_charge_amount_check" CHECK ("bills"."service_charge_amount" >= 0),
	CONSTRAINT "bills_total_check" CHECK ("bills"."total" >= 0),
	CONSTRAINT "bills_settled_check" CHECK (("bills"."status" = 'settled' AND "bills"."settled_at" IS NOT NULL AND "bills"."subtotal" IS NOT NULL AND "bills"."tax_amount" IS NOT NULL AND "bills"."total" IS NOT NULL) OR ("bills"."status" <> 'settled' AND "bills"."settled_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"spice" "spice",
	"salt" "salt",
	"ice" "ice",
	"added_by_type" "actor_type" NOT NULL,
	"added_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_added_by_staff_id_check" CHECK (("cart_items"."added_by_type" = 'staff' AND "cart_items"."added_by_staff_id" IS NOT NULL) OR ("cart_items"."added_by_type" = 'guest' AND "cart_items"."added_by_staff_id" IS NULL)),
	CONSTRAINT "cart_items_quantity_check" CHECK ("cart_items"."quantity" > 0 AND "cart_items"."quantity" <= 99)
);
--> statement-breakpoint
CREATE TABLE "menu_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"tax_rate" numeric(5, 4) NOT NULL,
	"status" "menu_category_status" DEFAULT 'active' NOT NULL,
	CONSTRAINT "menu_categories_restaurant_id_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "menu_categories_tax_rate_check" CHECK ("menu_categories"."tax_rate" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"prep_time" "menu_item_prep_time" NOT NULL,
	"serving_size" "menu_item_serving_size" NOT NULL,
	"diet" "diet" NOT NULL,
	"availability" "availability" DEFAULT 'available' NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"offers_spice" boolean DEFAULT false NOT NULL,
	"offers_salt" boolean DEFAULT false NOT NULL,
	"offers_ice" boolean DEFAULT false NOT NULL,
	"status" "menu_item_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_restaurant_id_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "menu_items_price_check" CHECK ("menu_items"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menu_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "menu_labels_restaurant_id_name_key" UNIQUE("restaurant_id","name")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"placed_by_type" "actor_type" NOT NULL,
	"placed_by_staff_id" uuid,
	"idempotency_key" text NOT NULL,
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_restaurant_id_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "orders_placed_by_staff_id_check" CHECK (("orders"."placed_by_type" = 'staff' AND "orders"."placed_by_staff_id" IS NOT NULL) OR ("orders"."placed_by_type" = 'guest' AND "orders"."placed_by_staff_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"item_name" text NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"tax_rate" numeric(5, 4) NOT NULL,
	"diet" "diet" NOT NULL,
	"quantity" integer NOT NULL,
	"spice" "spice",
	"salt" "salt",
	"ice" "ice",
	"status" "order_item_status" DEFAULT 'placed' NOT NULL,
	"preparing_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"menu_item_id" uuid,
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0 AND "order_items"."quantity" <= 99),
	CONSTRAINT "order_items_unit_price_check" CHECK ("order_items"."unit_price" >= 0),
	CONSTRAINT "order_items_tax_rate_check" CHECK ("order_items"."tax_rate" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"gst_number" text NOT NULL,
	"state" text NOT NULL,
	"pincode" text NOT NULL,
	"service_charge_rate" numeric(5, 4),
	"status" "restaurant_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_service_charge_rate_check" CHECK ("restaurants"."service_charge_rate" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "restaurant_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"label" text NOT NULL,
	"qr_token" text NOT NULL,
	"session_id" uuid,
	CONSTRAINT "restaurant_tables_qr_token_unique" UNIQUE("qr_token")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"mobile" text,
	"role" "staff_role" NOT NULL,
	"pin_hash" text,
	"status" "staff_status" DEFAULT 'invited' NOT NULL,
	"is_primary_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_restaurant_id_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "staff_primary_owner_requires_owner_role_check" CHECK (not "staff"."is_primary_owner" or "staff"."role" = 'owner')
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "table_sessions_restaurant_id_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "table_sessions_closed_at_check" CHECK (("table_sessions"."status" = 'active' AND "table_sessions"."closed_at" IS NULL) OR ("table_sessions"."status" = 'closed' AND "table_sessions"."closed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_restaurant_id_session_id_fkey" FOREIGN KEY ("restaurant_id","session_id") REFERENCES "public"."table_sessions"("restaurant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_restaurant_id_settled_by_fkey" FOREIGN KEY ("restaurant_id","settled_by") REFERENCES "public"."staff"("restaurant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_restaurant_id_session_id_fkey" FOREIGN KEY ("restaurant_id","session_id") REFERENCES "public"."table_sessions"("restaurant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_restaurant_id_menu_item_id_fkey" FOREIGN KEY ("restaurant_id","menu_item_id") REFERENCES "public"."menu_items"("restaurant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_restaurant_id_added_by_staff_id_fkey" FOREIGN KEY ("restaurant_id","added_by_staff_id") REFERENCES "public"."staff"("restaurant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_category_id_fkey" FOREIGN KEY ("restaurant_id","category_id") REFERENCES "public"."menu_categories"("restaurant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_labels" ADD CONSTRAINT "menu_labels_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_session_id_fkey" FOREIGN KEY ("restaurant_id","session_id") REFERENCES "public"."table_sessions"("restaurant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_placed_by_staff_id_fkey" FOREIGN KEY ("restaurant_id","placed_by_staff_id") REFERENCES "public"."staff"("restaurant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_restaurant_id_order_id_fkey" FOREIGN KEY ("restaurant_id","order_id") REFERENCES "public"."orders"("restaurant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_restaurant_id_menu_item_id_fkey" FOREIGN KEY ("restaurant_id","menu_item_id") REFERENCES "public"."menu_items"("restaurant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_restaurant_id_session_id_fkey" FOREIGN KEY ("restaurant_id","session_id") REFERENCES "public"."table_sessions"("restaurant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bills_restaurant_id_idx" ON "bills" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "cart_items_restaurant_id_session_id_idx" ON "cart_items" USING btree ("restaurant_id","session_id");--> statement-breakpoint
CREATE INDEX "cart_items_restaurant_id_menu_item_id_idx" ON "cart_items" USING btree ("restaurant_id","menu_item_id");--> statement-breakpoint
CREATE INDEX "menu_items_restaurant_id_category_id_idx" ON "menu_items" USING btree ("restaurant_id","category_id");--> statement-breakpoint
CREATE INDEX "orders_restaurant_id_session_id_idx" ON "orders" USING btree ("restaurant_id","session_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_restaurant_id_order_id_idx" ON "order_items" USING btree ("restaurant_id","order_id");--> statement-breakpoint
CREATE INDEX "order_items_restaurant_id_status_idx" ON "order_items" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "restaurant_tables_restaurant_id_session_id_idx" ON "restaurant_tables" USING btree ("restaurant_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_restaurant_id_primary_owner_idx" ON "staff" USING btree ("restaurant_id") WHERE "staff"."is_primary_owner";--> statement-breakpoint
CREATE INDEX "staff_restaurant_id_idx" ON "staff" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_restaurant_id_email_idx" ON "staff" USING btree ("restaurant_id","email") WHERE "staff"."status" <> 'removed';--> statement-breakpoint
CREATE UNIQUE INDEX "staff_restaurant_id_user_id_idx" ON "staff" USING btree ("restaurant_id","user_id") WHERE "staff"."user_id" is not null and "staff"."status" <> 'removed';