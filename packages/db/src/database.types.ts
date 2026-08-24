export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export type Database = {
	graphql_public: {
		Tables: {
			[_ in never]: never;
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			graphql: {
				Args: {
					extensions?: Json;
					operationName?: string;
					query?: string;
					variables?: Json;
				};
				Returns: Json;
			};
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
	public: {
		Tables: {
			bills: {
				Row: {
					bill_number: string;
					created_at: string;
					id: string;
					restaurant_id: string;
					service_charge_amount: number | null;
					service_charge_rate: number | null;
					service_charge_waived: boolean;
					session_id: string;
					settled_at: string | null;
					settled_by: string | null;
					status: Database["public"]["Enums"]["bill_status"];
					subtotal: number | null;
					tax_amount: number | null;
					total: number | null;
					updated_at: string;
				};
				Insert: {
					bill_number?: string;
					created_at?: string;
					id?: string;
					restaurant_id: string;
					service_charge_amount?: number | null;
					service_charge_rate?: number | null;
					service_charge_waived?: boolean;
					session_id: string;
					settled_at?: string | null;
					settled_by?: string | null;
					status?: Database["public"]["Enums"]["bill_status"];
					subtotal?: number | null;
					tax_amount?: number | null;
					total?: number | null;
					updated_at?: string;
				};
				Update: {
					bill_number?: string;
					created_at?: string;
					id?: string;
					restaurant_id?: string;
					service_charge_amount?: number | null;
					service_charge_rate?: number | null;
					service_charge_waived?: boolean;
					session_id?: string;
					settled_at?: string | null;
					settled_by?: string | null;
					status?: Database["public"]["Enums"]["bill_status"];
					subtotal?: number | null;
					tax_amount?: number | null;
					total?: number | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "bills_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "bills_restaurant_id_session_id_fkey";
						columns: ["restaurant_id", "session_id"];
						isOneToOne: false;
						referencedRelation: "table_sessions";
						referencedColumns: ["restaurant_id", "id"];
					},
					{
						foreignKeyName: "bills_restaurant_id_settled_by_fkey";
						columns: ["restaurant_id", "settled_by"];
						isOneToOne: false;
						referencedRelation: "staff";
						referencedColumns: ["restaurant_id", "id"];
					},
				];
			};
			cart_items: {
				Row: {
					added_by_staff_id: string | null;
					added_by_type: Database["public"]["Enums"]["actor_type"];
					created_at: string;
					ice: Database["public"]["Enums"]["ice"] | null;
					id: string;
					menu_item_id: string;
					quantity: number;
					restaurant_id: string;
					salt: Database["public"]["Enums"]["salt"] | null;
					session_id: string;
					spice: Database["public"]["Enums"]["spice"] | null;
				};
				Insert: {
					added_by_staff_id?: string | null;
					added_by_type: Database["public"]["Enums"]["actor_type"];
					created_at?: string;
					ice?: Database["public"]["Enums"]["ice"] | null;
					id?: string;
					menu_item_id: string;
					quantity: number;
					restaurant_id: string;
					salt?: Database["public"]["Enums"]["salt"] | null;
					session_id: string;
					spice?: Database["public"]["Enums"]["spice"] | null;
				};
				Update: {
					added_by_staff_id?: string | null;
					added_by_type?: Database["public"]["Enums"]["actor_type"];
					created_at?: string;
					ice?: Database["public"]["Enums"]["ice"] | null;
					id?: string;
					menu_item_id?: string;
					quantity?: number;
					restaurant_id?: string;
					salt?: Database["public"]["Enums"]["salt"] | null;
					session_id?: string;
					spice?: Database["public"]["Enums"]["spice"] | null;
				};
				Relationships: [
					{
						foreignKeyName: "cart_items_restaurant_id_added_by_staff_id_fkey";
						columns: ["restaurant_id", "added_by_staff_id"];
						isOneToOne: false;
						referencedRelation: "staff";
						referencedColumns: ["restaurant_id", "id"];
					},
					{
						foreignKeyName: "cart_items_restaurant_id_menu_item_id_fkey";
						columns: ["restaurant_id", "menu_item_id"];
						isOneToOne: false;
						referencedRelation: "menu_items";
						referencedColumns: ["restaurant_id", "id"];
					},
					{
						foreignKeyName: "cart_items_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "cart_items_restaurant_id_session_id_fkey";
						columns: ["restaurant_id", "session_id"];
						isOneToOne: false;
						referencedRelation: "table_sessions";
						referencedColumns: ["restaurant_id", "id"];
					},
				];
			};
			menu_categories: {
				Row: {
					id: string;
					name: string;
					restaurant_id: string;
					sort: number;
					status: Database["public"]["Enums"]["menu_category_status"];
					tax_rate: number;
				};
				Insert: {
					id?: string;
					name: string;
					restaurant_id: string;
					sort?: number;
					status?: Database["public"]["Enums"]["menu_category_status"];
					tax_rate: number;
				};
				Update: {
					id?: string;
					name?: string;
					restaurant_id?: string;
					sort?: number;
					status?: Database["public"]["Enums"]["menu_category_status"];
					tax_rate?: number;
				};
				Relationships: [
					{
						foreignKeyName: "menu_categories_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
				];
			};
			menu_items: {
				Row: {
					availability: Database["public"]["Enums"]["availability"];
					category_id: string;
					created_at: string;
					description: string;
					diet: Database["public"]["Enums"]["diet"];
					id: string;
					labels: string[];
					name: string;
					offers_ice: boolean;
					offers_salt: boolean;
					offers_spice: boolean;
					prep_time: Database["public"]["Enums"]["menu_item_prep_time"];
					price: number;
					restaurant_id: string;
					serving_size: Database["public"]["Enums"]["menu_item_serving_size"];
					status: Database["public"]["Enums"]["menu_item_status"];
					updated_at: string;
				};
				Insert: {
					availability?: Database["public"]["Enums"]["availability"];
					category_id: string;
					created_at?: string;
					description: string;
					diet: Database["public"]["Enums"]["diet"];
					id?: string;
					labels?: string[];
					name: string;
					offers_ice?: boolean;
					offers_salt?: boolean;
					offers_spice?: boolean;
					prep_time: Database["public"]["Enums"]["menu_item_prep_time"];
					price: number;
					restaurant_id: string;
					serving_size: Database["public"]["Enums"]["menu_item_serving_size"];
					status?: Database["public"]["Enums"]["menu_item_status"];
					updated_at?: string;
				};
				Update: {
					availability?: Database["public"]["Enums"]["availability"];
					category_id?: string;
					created_at?: string;
					description?: string;
					diet?: Database["public"]["Enums"]["diet"];
					id?: string;
					labels?: string[];
					name?: string;
					offers_ice?: boolean;
					offers_salt?: boolean;
					offers_spice?: boolean;
					prep_time?: Database["public"]["Enums"]["menu_item_prep_time"];
					price?: number;
					restaurant_id?: string;
					serving_size?: Database["public"]["Enums"]["menu_item_serving_size"];
					status?: Database["public"]["Enums"]["menu_item_status"];
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "menu_items_restaurant_id_category_id_fkey";
						columns: ["restaurant_id", "category_id"];
						isOneToOne: false;
						referencedRelation: "menu_categories";
						referencedColumns: ["restaurant_id", "id"];
					},
					{
						foreignKeyName: "menu_items_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
				];
			};
			menu_labels: {
				Row: {
					id: string;
					name: string;
					restaurant_id: string;
				};
				Insert: {
					id?: string;
					name: string;
					restaurant_id: string;
				};
				Update: {
					id?: string;
					name?: string;
					restaurant_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "menu_labels_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
				];
			};
			order_items: {
				Row: {
					added_by_staff_id: string | null;
					cancelled_quantity: number;
					diet: Database["public"]["Enums"]["diet"];
					ice: Database["public"]["Enums"]["ice"] | null;
					id: string;
					item_name: string;
					menu_item_id: string | null;
					order_id: string;
					preparing_at: string | null;
					quantity: number;
					ready_at: string | null;
					restaurant_id: string;
					salt: Database["public"]["Enums"]["salt"] | null;
					spice: Database["public"]["Enums"]["spice"] | null;
					status: Database["public"]["Enums"]["order_item_status"];
					tax_rate: number;
					unit_price: number;
					waived_quantity: number;
				};
				Insert: {
					added_by_staff_id?: string | null;
					cancelled_quantity?: number;
					diet: Database["public"]["Enums"]["diet"];
					ice?: Database["public"]["Enums"]["ice"] | null;
					id?: string;
					item_name: string;
					menu_item_id?: string | null;
					order_id: string;
					preparing_at?: string | null;
					quantity: number;
					ready_at?: string | null;
					restaurant_id: string;
					salt?: Database["public"]["Enums"]["salt"] | null;
					spice?: Database["public"]["Enums"]["spice"] | null;
					status?: Database["public"]["Enums"]["order_item_status"];
					tax_rate: number;
					unit_price: number;
					waived_quantity?: number;
				};
				Update: {
					added_by_staff_id?: string | null;
					cancelled_quantity?: number;
					diet?: Database["public"]["Enums"]["diet"];
					ice?: Database["public"]["Enums"]["ice"] | null;
					id?: string;
					item_name?: string;
					menu_item_id?: string | null;
					order_id?: string;
					preparing_at?: string | null;
					quantity?: number;
					ready_at?: string | null;
					restaurant_id?: string;
					salt?: Database["public"]["Enums"]["salt"] | null;
					spice?: Database["public"]["Enums"]["spice"] | null;
					status?: Database["public"]["Enums"]["order_item_status"];
					tax_rate?: number;
					unit_price?: number;
					waived_quantity?: number;
				};
				Relationships: [
					{
						foreignKeyName: "order_items_restaurant_id_added_by_staff_id_fkey";
						columns: ["restaurant_id", "added_by_staff_id"];
						isOneToOne: false;
						referencedRelation: "staff";
						referencedColumns: ["restaurant_id", "id"];
					},
					{
						foreignKeyName: "order_items_restaurant_id_menu_item_id_fkey";
						columns: ["restaurant_id", "menu_item_id"];
						isOneToOne: false;
						referencedRelation: "menu_items";
						referencedColumns: ["restaurant_id", "id"];
					},
					{
						foreignKeyName: "order_items_restaurant_id_order_id_fkey";
						columns: ["restaurant_id", "order_id"];
						isOneToOne: false;
						referencedRelation: "orders";
						referencedColumns: ["restaurant_id", "id"];
					},
					{
						foreignKeyName: "order_items_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
				];
			};
			orders: {
				Row: {
					id: string;
					idempotency_key: string;
					placed_at: string;
					placed_by_staff_id: string | null;
					placed_by_type: Database["public"]["Enums"]["actor_type"];
					restaurant_id: string;
					session_id: string;
				};
				Insert: {
					id?: string;
					idempotency_key: string;
					placed_at?: string;
					placed_by_staff_id?: string | null;
					placed_by_type: Database["public"]["Enums"]["actor_type"];
					restaurant_id: string;
					session_id: string;
				};
				Update: {
					id?: string;
					idempotency_key?: string;
					placed_at?: string;
					placed_by_staff_id?: string | null;
					placed_by_type?: Database["public"]["Enums"]["actor_type"];
					restaurant_id?: string;
					session_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "orders_restaurant_id_placed_by_staff_id_fkey";
						columns: ["restaurant_id", "placed_by_staff_id"];
						isOneToOne: false;
						referencedRelation: "staff";
						referencedColumns: ["restaurant_id", "id"];
					},
					{
						foreignKeyName: "orders_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "orders_restaurant_id_session_id_fkey";
						columns: ["restaurant_id", "session_id"];
						isOneToOne: false;
						referencedRelation: "table_sessions";
						referencedColumns: ["restaurant_id", "id"];
					},
				];
			};
			restaurant_tables: {
				Row: {
					id: string;
					label: string;
					qr_token: string;
					restaurant_id: string;
					session_id: string | null;
					status: Database["public"]["Enums"]["restaurant_table_status"];
				};
				Insert: {
					id?: string;
					label: string;
					qr_token: string;
					restaurant_id: string;
					session_id?: string | null;
					status?: Database["public"]["Enums"]["restaurant_table_status"];
				};
				Update: {
					id?: string;
					label?: string;
					qr_token?: string;
					restaurant_id?: string;
					session_id?: string | null;
					status?: Database["public"]["Enums"]["restaurant_table_status"];
				};
				Relationships: [
					{
						foreignKeyName: "restaurant_tables_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "restaurant_tables_restaurant_id_session_id_fkey";
						columns: ["restaurant_id", "session_id"];
						isOneToOne: false;
						referencedRelation: "table_sessions";
						referencedColumns: ["restaurant_id", "id"];
					},
				];
			};
			restaurants: {
				Row: {
					address: string;
					city: string;
					created_at: string;
					experience: Database["public"]["Enums"]["restaurant_experience"];
					gst_number: string;
					id: string;
					name: string;
					pincode: string;
					service_charge_rate: number | null;
					state: string;
					status: Database["public"]["Enums"]["restaurant_status"];
					updated_at: string;
				};
				Insert: {
					address: string;
					city: string;
					created_at?: string;
					experience?: Database["public"]["Enums"]["restaurant_experience"];
					gst_number: string;
					id?: string;
					name: string;
					pincode: string;
					service_charge_rate?: number | null;
					state: string;
					status?: Database["public"]["Enums"]["restaurant_status"];
					updated_at?: string;
				};
				Update: {
					address?: string;
					city?: string;
					created_at?: string;
					experience?: Database["public"]["Enums"]["restaurant_experience"];
					gst_number?: string;
					id?: string;
					name?: string;
					pincode?: string;
					service_charge_rate?: number | null;
					state?: string;
					status?: Database["public"]["Enums"]["restaurant_status"];
					updated_at?: string;
				};
				Relationships: [];
			};
			staff: {
				Row: {
					created_at: string;
					email: string;
					id: string;
					invited_at: string;
					is_primary_owner: boolean;
					mobile: string | null;
					name: string | null;
					pin_hash: string | null;
					restaurant_id: string;
					role: Database["public"]["Enums"]["staff_role"];
					status: Database["public"]["Enums"]["staff_status"];
					updated_at: string;
					user_id: string | null;
				};
				Insert: {
					created_at?: string;
					email: string;
					id?: string;
					invited_at?: string;
					is_primary_owner?: boolean;
					mobile?: string | null;
					name?: string | null;
					pin_hash?: string | null;
					restaurant_id: string;
					role: Database["public"]["Enums"]["staff_role"];
					status?: Database["public"]["Enums"]["staff_status"];
					updated_at?: string;
					user_id?: string | null;
				};
				Update: {
					created_at?: string;
					email?: string;
					id?: string;
					invited_at?: string;
					is_primary_owner?: boolean;
					mobile?: string | null;
					name?: string | null;
					pin_hash?: string | null;
					restaurant_id?: string;
					role?: Database["public"]["Enums"]["staff_role"];
					status?: Database["public"]["Enums"]["staff_status"];
					updated_at?: string;
					user_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: "staff_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
				];
			};
			station_devices: {
				Row: {
					created_at: string;
					id: string;
					restaurant_id: string;
					revoked_at: string | null;
					station_type: Database["public"]["Enums"]["station_type"];
				};
				Insert: {
					created_at?: string;
					id?: string;
					restaurant_id: string;
					revoked_at?: string | null;
					station_type: Database["public"]["Enums"]["station_type"];
				};
				Update: {
					created_at?: string;
					id?: string;
					restaurant_id?: string;
					revoked_at?: string | null;
					station_type?: Database["public"]["Enums"]["station_type"];
				};
				Relationships: [
					{
						foreignKeyName: "station_devices_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
				];
			};
			station_pairing_codes: {
				Row: {
					code_hash: string;
					created_at: string;
					created_by_staff_id: string;
					expires_at: string;
					id: string;
					redeemed_at: string | null;
					restaurant_id: string;
					station_type: Database["public"]["Enums"]["station_type"];
				};
				Insert: {
					code_hash: string;
					created_at?: string;
					created_by_staff_id: string;
					expires_at: string;
					id?: string;
					redeemed_at?: string | null;
					restaurant_id: string;
					station_type: Database["public"]["Enums"]["station_type"];
				};
				Update: {
					code_hash?: string;
					created_at?: string;
					created_by_staff_id?: string;
					expires_at?: string;
					id?: string;
					redeemed_at?: string | null;
					restaurant_id?: string;
					station_type?: Database["public"]["Enums"]["station_type"];
				};
				Relationships: [
					{
						foreignKeyName: "station_pairing_codes_created_by_staff_id_staff_id_fk";
						columns: ["created_by_staff_id"];
						isOneToOne: false;
						referencedRelation: "staff";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "station_pairing_codes_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
				];
			};
			table_sessions: {
				Row: {
					closed_at: string | null;
					id: string;
					opened_at: string;
					restaurant_id: string;
					status: Database["public"]["Enums"]["session_status"];
				};
				Insert: {
					closed_at?: string | null;
					id?: string;
					opened_at?: string;
					restaurant_id: string;
					status?: Database["public"]["Enums"]["session_status"];
				};
				Update: {
					closed_at?: string | null;
					id?: string;
					opened_at?: string;
					restaurant_id?: string;
					status?: Database["public"]["Enums"]["session_status"];
				};
				Relationships: [
					{
						foreignKeyName: "table_sessions_restaurant_id_restaurants_id_fk";
						columns: ["restaurant_id"];
						isOneToOne: false;
						referencedRelation: "restaurants";
						referencedColumns: ["id"];
					},
				];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			admin_create_restaurant: {
				Args: {
					p_address: string;
					p_city: string;
					p_experience: Database["public"]["Enums"]["restaurant_experience"];
					p_gst_number: string;
					p_name: string;
					p_owner_email: string;
					p_owner_mobile: string;
					p_owner_name: string;
					p_pincode: string;
					p_service_charge_rate: number;
					p_state: string;
				};
				Returns: {
					restaurant_id: string;
					staff_id: string;
				}[];
			};
			admin_reset_staff_pin: {
				Args: { p_pin: string; p_staff_id: string };
				Returns: undefined;
			};
			admin_update_restaurant: {
				Args: {
					p_address: string;
					p_city: string;
					p_experience: Database["public"]["Enums"]["restaurant_experience"];
					p_gst_number: string;
					p_id: string;
					p_name: string;
					p_owner_email: string;
					p_owner_mobile: string;
					p_owner_name: string;
					p_pincode: string;
					p_service_charge_rate: number;
					p_state: string;
				};
				Returns: string;
			};
			assert_restaurant_track_unchanged: {
				Args: {
					p_id: string;
					p_new_experience: Database["public"]["Enums"]["restaurant_experience"];
				};
				Returns: undefined;
			};
			broadcast_event: {
				Args: { p_event: string; p_payload: Json; p_topic: string };
				Returns: undefined;
			};
			can_access_menu_topic: {
				Args: { p_restaurant_id: string };
				Returns: boolean;
			};
			can_access_restaurant_topic: {
				Args: { p_restaurant_id: string };
				Returns: boolean;
			};
			can_access_session_topic: {
				Args: { p_session_id: string };
				Returns: boolean;
			};
			claim_station_staff: {
				Args: {
					p_email: string;
					p_restaurant_id: string;
					p_station_type: Database["public"]["Enums"]["station_type"];
				};
				Returns: {
					needs_user: boolean;
					staff_id: string;
					user_id: string;
				}[];
			};
			close_session: { Args: { p_session_id: string }; Returns: undefined };
			encode_bill_number: { Args: { v_seq: number }; Returns: string };
			ensure_menu_qr_table: {
				Args: { p_restaurant_id: string };
				Returns: undefined;
			};
			finish_station_provisioning: {
				Args: {
					p_restaurant_id: string;
					p_station_type: Database["public"]["Enums"]["station_type"];
				};
				Returns: string;
			};
			force_terminate_session: {
				Args: { p_session_id: string };
				Returns: undefined;
			};
			generate_pairing_code: {
				Args: {
					p_restaurant_id: string;
					p_station_type: Database["public"]["Enums"]["station_type"];
				};
				Returns: {
					code: string;
					expires_at: string;
				}[];
			};
			invite_staff: {
				Args: {
					p_email: string;
					p_name: string;
					p_restaurant_id: string;
					p_role: Database["public"]["Enums"]["staff_role"];
				};
				Returns: {
					email: string;
					id: string;
					name: string;
					role: Database["public"]["Enums"]["staff_role"];
					status: Database["public"]["Enums"]["staff_status"];
				}[];
			};
			is_active_guest_session: {
				Args: { p_restaurant_id: string; p_session_id: string };
				Returns: boolean;
			};
			is_active_staff_for_restaurant: {
				Args: { p_restaurant_id: string };
				Returns: boolean;
			};
			is_dineinly_admin: { Args: never; Returns: boolean };
			is_staff_manager_for_restaurant: {
				Args: { p_restaurant_id: string };
				Returns: boolean;
			};
			is_station_device_revoked: {
				Args: { p_device_id: string };
				Returns: boolean;
			};
			jwt_is_guest_for_restaurant: {
				Args: { p_restaurant_id: string };
				Returns: boolean;
			};
			jwt_is_guest_for_session: {
				Args: { p_restaurant_id: string; p_session_id: string };
				Returns: boolean;
			};
			link_staff_account: {
				Args: never;
				Returns: {
					name: string;
					restaurant_id: string;
					role: Database["public"]["Enums"]["staff_role"];
					staff_id: string;
				}[];
			};
			link_station_user: {
				Args: { p_staff_id: string; p_user_id: string };
				Returns: undefined;
			};
			list_station_devices: {
				Args: { p_restaurant_id: string };
				Returns: {
					created_at: string;
					id: string;
					revoked_at: string;
					station_type: Database["public"]["Enums"]["station_type"];
				}[];
			};
			merge_table_into_session: {
				Args: { p_session_id: string; p_table_id: string };
				Returns: undefined;
			};
			owner_update_restaurant: {
				Args: {
					p_address: string;
					p_city: string;
					p_experience: Database["public"]["Enums"]["restaurant_experience"];
					p_gst_number: string;
					p_id: string;
					p_name: string;
					p_pincode: string;
					p_service_charge_rate: number;
					p_state: string;
				};
				Returns: string;
			};
			reassign_primary_owner: {
				Args: { p_new_owner_staff_id: string; p_restaurant_id: string };
				Returns: {
					id: string;
					is_primary_owner: boolean;
					role: Database["public"]["Enums"]["staff_role"];
				}[];
			};
			redeem_pairing_code: {
				Args: { p_code: string };
				Returns: {
					restaurant_id: string;
					station_type: Database["public"]["Enums"]["station_type"];
				}[];
			};
			remove_staff: {
				Args: { p_staff_id: string };
				Returns: {
					id: string;
					status: Database["public"]["Enums"]["staff_status"];
				}[];
			};
			reorder_menu_categories: {
				Args: { p_category_ids: string[]; p_restaurant_id: string };
				Returns: undefined;
			};
			request_bill: { Args: never; Returns: string };
			resend_staff_invite: {
				Args: { p_staff_id: string };
				Returns: {
					email: string;
					id: string;
					invited_at: string;
					name: string;
					role: Database["public"]["Enums"]["staff_role"];
					status: Database["public"]["Enums"]["staff_status"];
				}[];
			};
			resolve_active_floor_staff: {
				Args: { p_restaurant_id: string; p_staff_id: string };
				Returns: {
					id: string;
					name: string;
					role: Database["public"]["Enums"]["staff_role"];
				}[];
			};
			resolve_qr_token: {
				Args: { p_qr_token: string };
				Returns: {
					experience: Database["public"]["Enums"]["restaurant_experience"];
					restaurant_id: string;
					table_label: string;
					table_session_id: string;
				}[];
			};
			resolve_staff_by_pin: {
				Args: { p_pin: string; p_restaurant_id: string };
				Returns: {
					name: string;
					staff_id: string;
				}[];
			};
			resolve_staff_signin: { Args: { p_email: string }; Returns: boolean };
			revoke_station_device: {
				Args: { p_device_id: string };
				Returns: {
					id: string;
					revoked_at: string;
				}[];
			};
			set_menu_item_availability: {
				Args: {
					p_availability: Database["public"]["Enums"]["availability"];
					p_item_id: string;
					p_restaurant_id: string;
				};
				Returns: {
					availability: Database["public"]["Enums"]["availability"];
					id: string;
				}[];
			};
			set_staff_pin: {
				Args: { p_pin: string; p_restaurant_id: string };
				Returns: undefined;
			};
			staff_role_for_restaurant: {
				Args: { p_restaurant_id: string };
				Returns: Database["public"]["Enums"]["staff_role"];
			};
			staff_submit_order: {
				Args: {
					p_idempotency_key: string;
					p_restaurant_id: string;
					p_session_id: string;
				};
				Returns: string;
			};
			submit_order: { Args: { p_idempotency_key: string }; Returns: string };
			try_uuid: { Args: { p_text: string }; Returns: string };
			update_own_staff_profile: {
				Args: { p_name: string; p_restaurant_id: string };
				Returns: undefined;
			};
			update_staff: {
				Args: {
					p_email: string;
					p_name: string;
					p_role: Database["public"]["Enums"]["staff_role"];
					p_staff_id: string;
				};
				Returns: {
					email: string;
					id: string;
					name: string;
					role: Database["public"]["Enums"]["staff_role"];
					status: Database["public"]["Enums"]["staff_status"];
				}[];
			};
		};
		Enums: {
			actor_type: "staff" | "guest";
			availability: "available" | "sold_out";
			bill_status: "open" | "requested" | "settled";
			diet: "veg" | "non_veg";
			ice: "none" | "less" | "regular";
			menu_category_status: "active" | "archived";
			menu_item_prep_time:
				| "5-10 mins"
				| "10-15 mins"
				| "15-20 mins"
				| "20-30 mins"
				| "30-45 mins";
			menu_item_serving_size:
				| "serves 1"
				| "serves 1-2"
				| "serves 2"
				| "serves 2-3"
				| "serves 4-5"
				| "serves 5+";
			menu_item_status: "active" | "archived";
			order_item_status:
				| "placed"
				| "preparing"
				| "ready"
				| "served"
				| "cancelled";
			restaurant_experience: "menu" | "guest" | "counter" | "one";
			restaurant_status: "active" | "archived";
			restaurant_table_status: "active" | "archived";
			salt: "less salt" | "regular";
			session_status: "active" | "closed";
			spice: "mild" | "regular" | "extra spicy";
			staff_role: "waiter" | "kitchen" | "manager" | "owner";
			staff_status: "invited" | "active" | "removed";
			station_type: "waiter";
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
	keyof Database,
	"public"
>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
				DefaultSchema["Views"])
		? (DefaultSchema["Tables"] &
				DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema["Tables"]
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema["Tables"]
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		| keyof DefaultSchema["Enums"]
		| { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
		: never = never,
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
		? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		| keyof DefaultSchema["CompositeTypes"]
		| { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
		: never = never,
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
		? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	graphql_public: {
		Enums: {},
	},
	public: {
		Enums: {
			actor_type: ["staff", "guest"],
			availability: ["available", "sold_out"],
			bill_status: ["open", "requested", "settled"],
			diet: ["veg", "non_veg"],
			ice: ["none", "less", "regular"],
			menu_category_status: ["active", "archived"],
			menu_item_prep_time: [
				"5-10 mins",
				"10-15 mins",
				"15-20 mins",
				"20-30 mins",
				"30-45 mins",
			],
			menu_item_serving_size: [
				"serves 1",
				"serves 1-2",
				"serves 2",
				"serves 2-3",
				"serves 4-5",
				"serves 5+",
			],
			menu_item_status: ["active", "archived"],
			order_item_status: [
				"placed",
				"preparing",
				"ready",
				"served",
				"cancelled",
			],
			restaurant_experience: ["menu", "guest", "counter", "one"],
			restaurant_status: ["active", "archived"],
			restaurant_table_status: ["active", "archived"],
			salt: ["less salt", "regular"],
			session_status: ["active", "closed"],
			spice: ["mild", "regular", "extra spicy"],
			staff_role: ["waiter", "kitchen", "manager", "owner"],
			staff_status: ["invited", "active", "removed"],
			station_type: ["waiter"],
		},
	},
} as const;
