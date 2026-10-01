export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'gold' | 'outline'; size?: 'sm' | 'md'; }
export interface TagProps { children: React.ReactNode; }
export interface BadgeProps { tone?: 'default' | 'onDark'; children: React.ReactNode; }
export interface CardProps { title?: string; children: React.ReactNode; }
export interface StatProps { value: string; label: string; note?: string; }
export interface CalloutProps { tone?: 'note' | 'warning'; title?: string; children: React.ReactNode; }
export interface CodeBlockProps { children: string; }
export interface DataTableProps { columns: string[]; rows: React.ReactNode[][]; }
export interface ArchitectureExplorerProps { initialView?: 'journey' | 'arch' | 'flow'; title?: string; subtitle?: string; }
export interface Product { id: string; name: string; description: string; price: number; badge?: string; category?: string; stock?: number; images?: string[]; }
export interface ProductCardProps extends Product { slots?: number; wishlisted?: boolean; onWishlist?: (id: string, next: boolean) => void; onAdd?: (product: Product) => void; }
export interface HomeScreenProps { products?: Product[]; categories?: string[]; ramadan?: boolean; heroImage?: string; cartCount?: number; onAddToCart?: (product: Product) => void; onWishlist?: (id: string, next: boolean) => void; onShop?: () => void; onNavigate?: (page: string) => void; onLogin?: () => void; checkDelivery?: DeliveryCheckerProps["check"]; onDeliveryResult?: (result: DeliveryResult | null) => void; supportPhone?: string; onHelp?: (kind: string) => void; support?: boolean; }
export interface CartItem { id: string; name: string; detail?: string; price: number; qty: number; stock?: number; image?: string; }
export interface DeliveryResult { serviceable: boolean; message: string; zone?: string; fee?: number; eta?: string; pincode?: string; }
export type PromoRule = { type: 'percent' | 'flat'; value: number; min?: number };
export interface CartCheckoutDetails { note: string; tip: number; promo: string | null; pincode: string | null; zone: string | null; }
export interface CartProps { items: CartItem[]; deliveryFee?: number; discount?: number; promoCodes?: Record<string, PromoRule>; onApplyPromo?: (code: string, subtotal: number) => Promise<{ ok: boolean; message?: string; discount?: number; code?: string }> | { ok: boolean; message?: string; discount?: number; code?: string }; tips?: number[] | false; freeDeliveryFrom?: number; showDeliveryCheck?: boolean; checkDelivery?: (pincode: string) => Promise<DeliveryResult> | DeliveryResult; onChange?: (items: CartItem[]) => void; onWishlist?: (item: CartItem) => void; onCheckout?: (total: number, details: CartCheckoutDetails) => void; onContinue?: () => void; }
export type OrderStatus = 'PAYMENT_CONFIRMED' | 'PREPARING' | 'PACKED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export interface TrackedOrder { id: string; status: OrderStatus; etaMinutes?: number; etaTotal?: number; etaClock?: string; timestamps?: Partial<Record<OrderStatus, string>>; items?: { name: string; qty: number; price: number }[]; address?: string; cancelReason?: string; pin?: string; rider?: { name: string; phone?: string; vehicle?: string }; }
export interface FeedbackPayload { orderId?: string; overall: number; packaging: number | null; delivery: number | null; comment: string; }
export interface OrderTrackingProps { order: TrackedOrder; subscribe?: (orderId: string, onUpdate: (patch: Partial<TrackedOrder>) => void) => () => void; simulate?: boolean; shareUrl?: string; onCancel?: (orderId: string, reason: string) => void; onHelp?: (orderId: string) => void; onReorder?: (order: TrackedOrder) => void; onFeedback?: (feedback: FeedbackPayload) => void; }
export interface FeedbackFormProps { orderId?: string; onSubmit?: (feedback: FeedbackPayload) => void; }
export interface DeliveryCheckerProps { check?: (pincode: string) => Promise<DeliveryResult> | DeliveryResult; onResult?: (result: DeliveryResult | null) => void; tone?: 'default' | 'onDark'; label?: string; initialPin?: string; className?: string; }
export interface SupportButtonProps { phone?: string; message?: string; hours?: string; onHelp?: (kind: 'whatsapp' | 'call' | 'faq') => void; className?: string; }
export interface ShareButtonProps { title?: string; text?: string; url?: string; label?: string; }
export interface ProductSize { id: string; label: string; extra?: number; }
export interface ProductDetailProps { product: Product & { category?: string; longDescription?: string; ingredients?: string[]; sizes?: ProductSize[]; deliveryTime?: string }; wishlisted?: boolean; onAdd?: (product: Product, qty: number, size: ProductSize) => void; onWishlist?: (id: string, next: boolean) => void; renderModel?: (product: Product) => React.ReactNode; shareUrl?: string; onNotify?: (product: Product) => void; }
export interface A11yPrefs { theme: 'auto' | 'light' | 'dark' | 'contrast'; motion: 'system' | 'reduce'; text: 'default' | 'large' | 'larger'; }
export interface A11yProviderProps { skipTo?: string; storageKey?: string; children: React.ReactNode; }
export interface A11yPanelProps { defaultOpen?: boolean; }
export interface SkipLinkProps { target?: string; children?: React.ReactNode; }
export function useA11y(): { prefs: A11yPrefs; theme?: string; set: (key: keyof A11yPrefs, value: string) => void; reset: () => void } | null;
