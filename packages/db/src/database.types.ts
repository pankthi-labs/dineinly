export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bills: {
        Row: {
          created_at: string
          id: string
          restaurant_id: string
          service_charge_amount: number | null
          service_charge_rate: number | null
          session_id: string
          settled_at: string | null
          settled_by: string | null
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number | null
          tax_amount: number | null
          total: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          restaurant_id: string
          service_charge_amount?: number | null
          service_charge_rate?: number | null
          session_id: string
          settled_at?: string | null
          settled_by?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          restaurant_id?: string
          service_charge_amount?: number | null
          service_charge_rate?: number | null
          session_id?: string
          settled_at?: string | null
          settled_by?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_restaurant_id_restaurants_id_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_restaurant_id_session_id_fkey"
            columns: ["restaurant_id", "session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "bills_restaurant_id_settled_by_fkey"
            columns: ["restaurant_id", "settled_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      cart_items: {
        Row: {
          added_by_staff_id: string | null
          added_by_type: Database["public"]["Enums"]["actor_type"]
          created_at: string
          ice: Database["public"]["Enums"]["ice"] | null
          id: string
          menu_item_id: string
          quantity: number
          restaurant_id: string
          salt: Database["public"]["Enums"]["salt"] | null
          session_id: string
          spice: Database["public"]["Enums"]["spice"] | null
        }
        Insert: {
          added_by_staff_id?: string | null
          added_by_type: Database["public"]["Enums"]["actor_type"]
          created_at?: string
          ice?: Database["public"]["Enums"]["ice"] | null
          id?: string
          menu_item_id: string
          quantity: number
          restaurant_id: string
          salt?: Database["public"]["Enums"]["salt"] | null
          session_id: string
          spice?: Database["public"]["Enums"]["spice"] | null
        }
        Update: {
          added_by_staff_id?: string | null
          added_by_type?: Database["public"]["Enums"]["actor_type"]
          created_at?: string
          ice?: Database["public"]["Enums"]["ice"] | null
          id?: string
          menu_item_id?: string
          quantity?: number
          restaurant_id?: string
          salt?: Database["public"]["Enums"]["salt"] | null
          session_id?: string
          spice?: Database["public"]["Enums"]["spice"] | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_restaurant_id_added_by_staff_id_fkey"
            columns: ["restaurant_id", "added_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "cart_items_restaurant_id_menu_item_id_fkey"
            columns: ["restaurant_id", "menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "cart_items_restaurant_id_restaurants_id_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_restaurant_id_session_id_fkey"
            columns: ["restaurant_id", "session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          id: string
          name: string
          restaurant_id: string
          sort: number
          status: Database["public"]["Enums"]["menu_category_status"]
          tax_rate: number
        }
        Insert: {
          id?: string
          name: string
          restaurant_id: string
          sort?: number
          status?: Database["public"]["Enums"]["menu_category_status"]
          tax_rate: number
        }
        Update: {
          id?: string
          name?: string
          restaurant_id?: string
          sort?: number
          status?: Database["public"]["Enums"]["menu_category_status"]
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_id_restaurants_id_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          availability: Database["public"]["Enums"]["availability"]
          category_id: string
          created_at: string
          description: string
          diet: Database["public"]["Enums"]["diet"]
          id: string
          labels: string[]
          name: string
          offers_ice: boolean
          offers_salt: boolean
          offers_spice: boolean
          prep_time: Database["public"]["Enums"]["menu_item_prep_time"]
          price: number
          restaurant_id: string
          serving_size: Database["public"]["Enums"]["menu_item_serving_size"]
          status: Database["public"]["Enums"]["menu_item_status"]
          updated_at: string
        }
        Insert: {
          availability?: Database["public"]["Enums"]["availability"]
          category_id: string
          created_at?: string
          description: string
          diet: Database["public"]["Enums"]["diet"]
          id?: string
          labels?: string[]
          name: string
          offers_ice?: boolean
          offers_salt?: boolean
          offers_spice?: boolean
          prep_time: Database["public"]["Enums"]["menu_item_prep_time"]
          price: number
          restaurant_id: string
          serving_size: Database["public"]["Enums"]["menu_item_serving_size"]
          status?: Database["public"]["Enums"]["menu_item_status"]
          updated_at?: string
        }
        Update: {
          availability?: Database["public"]["Enums"]["availability"]
          category_id?: string
          created_at?: string
          description?: string
          diet?: Database["public"]["Enums"]["diet"]
          id?: string
          labels?: string[]
          name?: string
          offers_ice?: boolean
          offers_salt?: boolean
          offers_spice?: boolean
          prep_time?: Database["public"]["Enums"]["menu_item_prep_time"]
          price?: number
          restaurant_id?: string
          serving_size?: Database["public"]["Enums"]["menu_item_serving_size"]
          status?: Database["public"]["Enums"]["menu_item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_category_id_fkey"
            columns: ["restaurant_id", "category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_restaurants_id_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_labels: {
        Row: {
          id: string
          name: string
          restaurant_id: string
        }
        Insert: {
          id?: string
          name: string
          restaurant_id: string
        }
        Update: {
          id?: string
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_labels_restaurant_id_restaurants_id_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          diet: Database["public"]["Enums"]["diet"]
          ice: Database["public"]["Enums"]["ice"] | null
          id: string
          item_name: string
          menu_item_id: string | null
          order_id: string
          preparing_at: string | null
          quantity: number
          ready_at: string | null
          restaurant_id: string
          salt: Database["public"]["Enums"]["salt"] | null
          spice: Database["public"]["Enums"]["spice"] | null
          status: Database["public"]["Enums"]["order_item_status"]
          tax_rate: number
          unit_price: number
        }
        Insert: {
          diet: Database["public"]["Enums"]["diet"]
          ice?: Database["public"]["Enums"]["ice"] | null
          id?: string
          item_name: string
          menu_item_id?: string | null
          order_id: string
          preparing_at?: string | null
          quantity: number
          ready_at?: string | null
          restaurant_id: string
          salt?: Database["public"]["Enums"]["salt"] | null
          spice?: Database["public"]["Enums"]["spice"] | null
          status?: Database["public"]["Enums"]["order_item_status"]
          tax_rate: number
          unit_price: number
        }
        Update: {
          diet?: Database["public"]["Enums"]["diet"]
          ice?: Database["public"]["Enums"]["ice"] | null
          id?: string
          item_name?: string
          menu_item_id?: string | null
          order_id?: string
          preparing_at?: string | null
          quantity?: number
          ready_at?: string | null
          restaurant_id?: string
          salt?: Database["public"]["Enums"]["salt"] | null
          spice?: Database["public"]["Enums"]["spice"] | null
          status?: Database["public"]["Enums"]["order_item_status"]
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_restaurant_id_menu_item_id_fkey"
            columns: ["restaurant_id", "menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_order_id_fkey"
            columns: ["restaurant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_restaurants_id_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          id: string
          idempotency_key: string
          placed_at: string
          placed_by_staff_id: string | null
          placed_by_type: Database["public"]["Enums"]["actor_type"]
          restaurant_id: string
          session_id: string
        }
        Insert: {
          id?: string
          idempotency_key: string
          placed_at?: string
          placed_by_staff_id?: string | null
          placed_by_type: Database["public"]["Enums"]["actor_type"]
          restaurant_id: string
          session_id: string
        }
        Update: {
          id?: string
          idempotency_key?: string
          placed_at?: string
          placed_by_staff_id?: string | null
          placed_by_type?: Database["public"]["Enums"]["actor_type"]
          restaurant_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_placed_by_staff_id_fkey"
            columns: ["restaurant_id", "placed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_restaurants_id_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_session_id_fkey"
            columns: ["restaurant_id", "session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          id: string
          label: string
          qr_token: string
          restaurant_id: string
          session_id: string | null
        }
        Insert: {
          id?: string
          label: string
          qr_token: string
          restaurant_id: string
          session_id?: string | null
        }
        Update: {
          id?: string
          label?: string
          qr_token?: string
          restaurant_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_restaurant_id_restaurants_id_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_restaurant_id_session_id_fkey"
            columns: ["restaurant_id", "session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string
          city: string
          created_at: string
          gst_number: string
          id: string
          name: string
          pincode: string
          service_charge_rate: number | null
          state: string
          status: Database["public"]["Enums"]["restaurant_status"]
          updated_at: string
        }
        Insert: {
          address: string
          city: string
          created_at?: string
          gst_number: string
          id?: string
          name: string
          pincode: string
          service_charge_rate?: number | null
          state: string
          status?: Database["public"]["Enums"]["restaurant_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          created_at?: string
          gst_number?: string
          id?: string
          name?: string
          pincode?: string
          service_charge_rate?: number | null
          state?: string
          status?: Database["public"]["Enums"]["restaurant_status"]
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          email: string
          id: string
          is_primary_owner: boolean
          mobile: string | null
          name: string | null
          pin_hash: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["staff_role"]
          status: Database["public"]["Enums"]["staff_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_primary_owner?: boolean
          mobile?: string | null
          name?: string | null
          pin_hash?: string | null
          restaurant_id: string
          role: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_primary_owner?: boolean
          mobile?: string | null
          name?: string | null
          pin_hash?: string | null
          restaurant_id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          status?: Database["public"]["Enums"]["staff_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_restaurant_id_restaurants_id_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          closed_at: string | null
          id: string
          opened_at: string
          restaurant_id: string
          status: Database["public"]["Enums"]["session_status"]
        }
        Insert: {
          closed_at?: string | null
          id?: string
          opened_at?: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["session_status"]
        }
        Update: {
          closed_at?: string | null
          id?: string
          opened_at?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_restaurant_id_restaurants_id_fk"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_restaurant: {
        Args: {
          p_address: string
          p_city: string
          p_gst_number: string
          p_name: string
          p_owner_email: string
          p_owner_mobile: string
          p_owner_name: string
          p_pincode: string
          p_service_charge_rate: number
          p_state: string
        }
        Returns: {
          restaurant_id: string
          staff_id: string
        }[]
      }
      admin_update_restaurant: {
        Args: {
          p_address: string
          p_city: string
          p_gst_number: string
          p_id: string
          p_name: string
          p_owner_email: string
          p_owner_mobile: string
          p_owner_name: string
          p_pincode: string
          p_service_charge_rate: number
          p_state: string
        }
        Returns: string
      }
      is_active_guest_session: {
        Args: { p_restaurant_id: string; p_session_id: string }
        Returns: boolean
      }
      is_active_staff_for_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      is_dineinly_admin: { Args: never; Returns: boolean }
      jwt_is_guest_for_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      jwt_is_guest_for_session: {
        Args: { p_restaurant_id: string; p_session_id: string }
        Returns: boolean
      }
      link_staff_account: {
        Args: never
        Returns: {
          name: string
          restaurant_id: string
          role: Database["public"]["Enums"]["staff_role"]
          staff_id: string
        }[]
      }
      reorder_menu_categories: {
        Args: { p_category_ids: string[]; p_restaurant_id: string }
        Returns: undefined
      }
      resolve_qr_token: {
        Args: { p_qr_token: string }
        Returns: {
          restaurant_id: string
          table_label: string
          table_session_id: string
        }[]
      }
      resolve_staff_signin: { Args: { p_email: string }; Returns: string }
      submit_order: { Args: { p_idempotency_key: string }; Returns: string }
    }
    Enums: {
      actor_type: "staff" | "guest"
      availability: "available" | "sold_out"
      bill_status: "open" | "requested" | "settled"
      diet: "veg" | "non_veg"
      ice: "none" | "less" | "regular"
      menu_category_status: "active" | "archived"
      menu_item_prep_time:
        | "5-10 mins"
        | "10-15 mins"
        | "15-20 mins"
        | "20-30 mins"
        | "30-45 mins"
      menu_item_serving_size:
        | "serves 1"
        | "serves 1-2"
        | "serves 2"
        | "serves 2-3"
        | "serves 4-5"
        | "serves 5+"
      menu_item_status: "active" | "archived"
      order_item_status:
        | "placed"
        | "preparing"
        | "ready"
        | "served"
        | "cancelled"
      restaurant_status: "active" | "archived"
      salt: "less salt" | "regular"
      session_status: "active" | "closed"
      spice: "mild" | "regular" | "extra spicy"
      staff_role: "waiter" | "kitchen" | "manager" | "owner"
      staff_status: "invited" | "active" | "removed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

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
      restaurant_status: ["active", "archived"],
      salt: ["less salt", "regular"],
      session_status: ["active", "closed"],
      spice: ["mild", "regular", "extra spicy"],
      staff_role: ["waiter", "kitchen", "manager", "owner"],
      staff_status: ["invited", "active", "removed"],
    },
  },
} as const

