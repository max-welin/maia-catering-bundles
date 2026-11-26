<?php
/**
 * Plugin Name:       Maia - Cateringpaket
 * Description:       Gör en WooCommerce-produkt till en paketprodukt: antal personer, val per grupp med +/- och totalsumma. Grupper och val hämtas från produktens fält i Product input fields.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Requires Plugins:  woocommerce
 * Author:            Maiamarketing
 * Text Domain:       cateringpaket
 * WC requires at least: 7.0
 */

defined( 'ABSPATH' ) || exit;

define( 'CATERINGPAKET_VERSION', '1.0.0' );
define( 'CATERINGPAKET_URL', plugin_dir_url( __FILE__ ) );

const CATERINGPAKET_META_ENABLED = '_cateringpaket_enabled';
const CATERINGPAKET_META_MIN     = '_cateringpaket_min';
const CATERINGPAKET_DEFAULT_MIN  = 10;

// The plugin never touches orders – declare WooCommerce HPOS compatibility.
add_action( 'before_woocommerce_init', function () {
	if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
	}
} );

/**
 * Minimum number of people for a product, or 0 if it is not a package product.
 *
 * @param WC_Product|int $product
 */
function cateringpaket_min( $product ) {
	$product = $product instanceof WC_Product ? $product : wc_get_product( (int) $product );
	if ( ! $product || 'yes' !== $product->get_meta( CATERINGPAKET_META_ENABLED ) ) {
		return 0;
	}
	$min = (int) $product->get_meta( CATERINGPAKET_META_MIN );
	return $min > 0 ? $min : CATERINGPAKET_DEFAULT_MIN;
}

/* -------------------------------------------------------------------------
 * Admin: product settings (General tab)
 * ---------------------------------------------------------------------- */

add_action( 'woocommerce_product_options_general_product_data', function () {
	echo '<div class="options_group">';

	woocommerce_wp_checkbox( array(
		'id'          => CATERINGPAKET_META_ENABLED,
		'label'       => __( 'Paketprodukt', 'cateringpaket' ),
		'description' => __( 'Visa stegformuläret (antal personer + val per grupp) på produktsidan.', 'cateringpaket' ),
	) );

	woocommerce_wp_text_input( array(
		'id'                => CATERINGPAKET_META_MIN,
		'label'             => __( 'Minsta antal personer', 'cateringpaket' ),
		'type'              => 'number',
		'placeholder'       => (string) CATERINGPAKET_DEFAULT_MIN,
		'desc_tip'          => true,
		'description'       => __( 'Gäller bara paketprodukter. Lämnas tomt blir det 10.', 'cateringpaket' ),
		'custom_attributes' => array( 'min' => '1', 'step' => '1' ),
	) );

	echo '</div>';
} );

add_action( 'woocommerce_admin_process_product_object', function ( $product ) {
	$enabled = isset( $_POST[ CATERINGPAKET_META_ENABLED ] ) ? 'yes' : 'no'; // phpcs:ignore WordPress.Security.NonceVerification -- WooCommerce verifies the nonce.
	$product->update_meta_data( CATERINGPAKET_META_ENABLED, $enabled );

	$min = isset( $_POST[ CATERINGPAKET_META_MIN ] ) ? absint( wp_unslash( $_POST[ CATERINGPAKET_META_MIN ] ) ) : 0; // phpcs:ignore WordPress.Security.NonceVerification
	if ( $min > 0 ) {
		$product->update_meta_data( CATERINGPAKET_META_MIN, $min );
	} else {
		$product->delete_meta_data( CATERINGPAKET_META_MIN );
	}
} );

/* -------------------------------------------------------------------------
 * Storefront: quantity, price and step form
 * ---------------------------------------------------------------------- */

// Quantity heading (only shown if JS does not run – otherwise replaced by step 1).
add_action( 'woocommerce_before_add_to_cart_quantity', function () {
	global $product;
	$min = $product ? cateringpaket_min( $product ) : 0;
	if ( $min ) {
		printf(
			'<p class="package-qty-heading"><strong>%s</strong> (%s)</p>',
			esc_html__( 'Hur många är ni?', 'cateringpaket' ),
			esc_html( sprintf( __( 'minst %d', 'cateringpaket' ), $min ) )
		);
	}
} );

// Minimum quantity.
add_filter( 'woocommerce_quantity_input_args', function ( $args, $product ) {
	$min = $product ? cateringpaket_min( $product ) : 0;
	if ( $min ) {
		$args['min_value'] = $min;
		if ( ! is_cart() ) {
			$args['input_value'] = max( $min, (int) ( $args['input_value'] ?? 0 ) );
		}
	}
	return $args;
}, 10, 2 );

// Server-side check too, so fewer than the minimum cannot be added to the cart.
add_filter( 'woocommerce_add_to_cart_validation', function ( $passed, $product_id, $quantity ) {
	$min = cateringpaket_min( $product_id );
	if ( $min && $quantity < $min ) {
		wc_add_notice( sprintf( __( 'Minsta antal för detta paket är %d personer.', 'cateringpaket' ), $min ), 'error' );
		return false;
	}
	return $passed;
}, 10, 3 );

// Price on the product page: "60 kr per person, ink moms".
add_filter( 'woocommerce_get_price_html', function ( $html, $product ) {
	if ( is_admin() || ! is_product() || ! $product || ! cateringpaket_min( $product ) ) {
		return $html;
	}
	$price    = (float) wc_get_price_to_display( $product );
	$decimals = floor( $price ) == $price ? 0 : wc_get_price_decimals();
	return wc_price( $price, array( 'decimals' => $decimals ) )
		. ' <span class="package-per-person">' . esc_html__( 'per person, ink moms', 'cateringpaket' ) . '</span>';
}, 20, 2 );

// Body class on package products, so the page can be styled separately.
add_filter( 'body_class', function ( $classes ) {
	if ( function_exists( 'is_product' ) && is_product() && cateringpaket_min( get_queried_object_id() ) ) {
		$classes[] = 'cateringpaket-product';
	}
	return $classes;
} );

// CSS and JS are only loaded on product pages for package products.
add_action( 'wp_enqueue_scripts', function () {
	if ( ! is_product() ) {
		return;
	}
	$product = wc_get_product( get_queried_object_id() );
	$min     = $product ? cateringpaket_min( $product ) : 0;
	if ( ! $min ) {
		return;
	}

	// Use the file's modification time as version, so the cache is busted automatically when it changes.
	$ver = function ( $file ) {
		$mtime = @filemtime( plugin_dir_path( __FILE__ ) . $file );
		return $mtime ? (string) $mtime : CATERINGPAKET_VERSION;
	};

	wp_enqueue_style( 'cateringpaket', CATERINGPAKET_URL . 'assets/cateringpaket.css', array(), $ver( 'assets/cateringpaket.css' ) );
	wp_enqueue_script( 'cateringpaket', CATERINGPAKET_URL . 'assets/cateringpaket.js', array(), $ver( 'assets/cateringpaket.js' ), true );
	wp_add_inline_script(
		'cateringpaket',
		'window.CateringpaketConfig = ' . wp_json_encode( array(
			'price' => (float) wc_get_price_to_display( $product ),
			'min'   => $min,
		) ) . ';',
		'before'
	);
} );

// Exclude the script from optimisation plugins that defer or combine JS.
add_filter( 'script_loader_tag', function ( $tag, $handle ) {
	if ( 'cateringpaket' === $handle ) {
		$tag = str_replace( ' src=', ' data-no-optimize="1" data-no-defer="1" data-cfasync="false" src=', $tag );
	}
	return $tag;
}, 10, 2 );
