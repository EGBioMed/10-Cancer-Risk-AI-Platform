<?php
/**
 * Plugin Name:       EG BioMed Access Code
 * Description:       WooCommerce 訂單付款後，向 egbiomed-ai-data-api 索取一組「已登記」的 AI Cancer Risk Assessment 存取代碼，寫入訂單並顯示在客戶信件與後台訂單頁。
 * Version:           2.0.0
 * Author:            EG BioMed
 * Requires at least: 6.0
 * Requires PHP:      7.4
 *
 * 取代舊的 Snippets 片段。以外掛形式安裝，不依賴 Snippets 工具是否能執行 PHP。
 *
 * 每個函式都有 function_exists 保護、常數都用 defined() 檢查：舊 snippet
 * 若哪天真的開始執行，不會因為同名重複宣告造成 fatal error 讓站台白畫面。
 * 但舊 snippet 仍應停用——它會在付款前產生一組「沒有登記過」的碼寫進訂單，
 * 本外掛讀到既有 meta 就會直接拿去寄。
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * =========================================================
 * EG BioMed - AI Cancer Risk Assessment
 * 付款完成後向 API 索取「已登記」的存取代碼，並顯示在客戶信件
 *
 * Product SKU: AI-CANCER-RISK
 *
 * 這份取代舊版 snippet 的全部內容。
 *
 * 為什麼代碼不再由這裡產生：
 * ai-cancer-risk.eg-bio.com 的閘門是用「正規化後（去頭尾空白、轉小寫、
 * 內部空白壓縮）的 SHA-256」查代碼。在這裡產生的碼只是一串字，除非有
 * 東西按同樣規則把它登記進資料庫，否則閘門查不到、一律拒絕——這正是
 * 客戶收到碼卻進不去的原因。改由 API 產生並登記後回傳，那條正規化規則
 * 就只有一份實作，兩邊不會走樣。
 * =========================================================
 */


/* ---------------------------------------------------------
 * 0. 設定
 *
 * 這份是 repo 保存版，金鑰是佔位字串。實際安裝在 mdi.eg-bio.com 上的
 * 那一份，這裡填的是後端 App Service 上 PURCHASE_API_KEY 的同一個值。
 * 金鑰不進版控：一旦進了 git，輪替就必須連同改 commit 歷史。
 *
 * 首選是在 wp-config.php 裡 define 同名常數，下面的 defined() 檢查會
 * 自動讓路；直接寫在這裡是因為那台站當初無法確認能否編輯 wp-config，
 * 兩者的暴露程度相當（都是伺服器上不對外提供原始碼的 PHP 檔）。
 * --------------------------------------------------------- */

if ( ! defined( 'EGBIO_PURCHASE_API_KEY' ) ) {
	define( 'EGBIO_PURCHASE_API_KEY', 'REPLACE_WITH_PURCHASE_API_KEY' );
}

if ( ! defined( 'EGBIO_ACCESS_API_URL' ) ) {
	define( 'EGBIO_ACCESS_API_URL', 'https://egbiomed-ai-data-api-freycna5dghng2d0.westus2-01.azurewebsites.net/api/purchases/access-code' );
}

if ( ! defined( 'EGBIO_ACCESS_META_KEY' ) ) {
	define( 'EGBIO_ACCESS_META_KEY', '_egbio_ai_access_code' );
}

if ( ! defined( 'EGBIO_ASSESSMENT_URL' ) ) {
	define( 'EGBIO_ASSESSMENT_URL', 'https://ai-cancer-risk.eg-bio.com/' );
}

if ( ! defined( 'EGBIO_PRODUCT_SKU' ) ) {
	define( 'EGBIO_PRODUCT_SKU', 'AI-CANCER-RISK' );
}


/* ---------------------------------------------------------
 * 0b. 載入確認橫幅（暫時性）
 *
 * 只在「外掛」與「訂單」頁面顯示，用來一眼確認外掛真的被 WordPress
 * 載入了。排查期間很有用：先前無法分辨「外掛沒載入」與「條件不符所以
 * 跳過」。確認流程穩定後可以把這一段刪掉。
 * --------------------------------------------------------- */

add_action( 'admin_notices', 'egbio_loaded_notice' );

if ( ! function_exists( 'egbio_loaded_notice' ) ) {
	function egbio_loaded_notice() {

		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;

		if ( ! $screen ) {
			return;
		}

		$show_on = array( 'plugins', 'shop_order', 'woocommerce_page_wc-orders', 'edit-shop_order' );

		if ( ! in_array( $screen->id, $show_on, true ) ) {
			return;
		}

		printf(
			'<div class="notice notice-info"><p><strong>EG BioMed Access Code v2.0.0 已載入。</strong> '
			. '金鑰：%s ／ WooCommerce：%s ／ 目標 SKU：<code>%s</code></p></div>',
			defined( 'EGBIO_PURCHASE_API_KEY' ) && EGBIO_PURCHASE_API_KEY ? '已設定' : '<strong>未設定</strong>',
			defined( 'WC_VERSION' ) ? esc_html( WC_VERSION ) : '<strong>偵測不到</strong>',
			esc_html( EGBIO_PRODUCT_SKU )
		);
	}
}


/* ---------------------------------------------------------
 * 1. 判斷訂單中是否包含 AI Cancer Risk Assessment
 * --------------------------------------------------------- */

if ( ! function_exists( 'egbio_order_has_ai_cancer_risk' ) ) {
	function egbio_order_has_ai_cancer_risk( $order ) {

		if ( ! $order instanceof WC_Order ) {
			return false;
		}

		foreach ( $order->get_items( 'line_item' ) as $item ) {

			$product = $item->get_product();

			if ( $product && $product->get_sku() === EGBIO_PRODUCT_SKU ) {
				return true;
			}
		}

		return false;
	}
}


/* ---------------------------------------------------------
 * 2. 向 API 索取一組已登記的 Access Code
 *
 * 回傳字串，或 WP_Error。
 *
 * 端點依 order_reference 冪等：WooCommerce 會重送、訂單也會經過多個
 * 已付款狀態，重複呼叫一律回同一組碼，不會讓一筆訂單產生多組各自可
 * 兌換的代碼。
 * --------------------------------------------------------- */

if ( ! function_exists( 'egbio_request_ai_access_code' ) ) {
	function egbio_request_ai_access_code( $order ) {

		if ( ! defined( 'EGBIO_PURCHASE_API_KEY' ) || ! EGBIO_PURCHASE_API_KEY ) {
			return new WP_Error( 'egbio_missing_key', 'EGBIO_PURCHASE_API_KEY is not set' );
		}

		$response = wp_remote_post(
			EGBIO_ACCESS_API_URL,
			array(
				'timeout' => 20,
				'headers' => array(
					'Content-Type'            => 'application/json',
					'x-egbiomed-purchase-key' => EGBIO_PURCHASE_API_KEY,
				),
				'body'    => wp_json_encode(
					array(
						'order_reference' => (string) $order->get_id(),
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		$parsed = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status && 201 !== $status ) {
			return new WP_Error(
				'egbio_api_error',
				sprintf( 'Access code API returned HTTP %d', $status )
			);
		}

		if ( empty( $parsed['access_code'] ) ) {
			return new WP_Error( 'egbio_api_error', 'Access code API returned no access_code' );
		}

		// 顯示成客戶信件慣用的大寫形式。閘門比對前會轉小寫，客戶打大寫
		// 或小寫都能通過。
		return strtoupper( $parsed['access_code'] );
	}
}


/* ---------------------------------------------------------
 * 3. 取得 Access Code（先讀訂單 meta，必要時才呼叫 API）
 *
 * 刻意不在本機補產生一組：API 連不上時，一組資料庫裡不存在的碼寄到
 * 客戶手上比「信裡沒有代碼」更糟——客戶會以為自己打錯，而客服端只
 * 看得到一筆查無此碼的紀錄。
 * --------------------------------------------------------- */

if ( ! function_exists( 'egbio_get_ai_access_code' ) ) {
	function egbio_get_ai_access_code( $order ) {

		$access_code = $order->get_meta( EGBIO_ACCESS_META_KEY );

		if ( ! empty( $access_code ) ) {
			return $access_code;
		}

		$access_code = egbio_request_ai_access_code( $order );

		if ( is_wp_error( $access_code ) ) {
			return $access_code;
		}

		$order->update_meta_data( EGBIO_ACCESS_META_KEY, $access_code );
		$order->save();

		return $access_code;
	}
}


/* ---------------------------------------------------------
 * 4. 付款完成後才索取 Access Code
 *
 * 刻意不掛 woocommerce_checkout_create_order：那是訂單「建立」時觸發，
 * 也就是付款之前，每一次結帳嘗試（含放棄與付款失敗）都會拿到一組可
 * 兌換的代碼。
 *
 * 掛狀態轉換而不是 woocommerce_payment_complete，是因為
 * WC_Order::payment_complete() 會先 save()（觸發狀態轉換與客戶信件）
 * 才 do_action( 'woocommerce_payment_complete' )；而
 * woocommerce_order_status_processing 一定在寄信的 ..._notification
 * action 之前執行，代碼因此保證在信件渲染前就已存在。
 * --------------------------------------------------------- */

add_action( 'woocommerce_order_status_processing', 'egbio_issue_ai_access_code', 5, 1 );
add_action( 'woocommerce_order_status_completed', 'egbio_issue_ai_access_code', 5, 1 );

if ( ! function_exists( 'egbio_issue_ai_access_code' ) ) {
	function egbio_issue_ai_access_code( $order_id ) {

		$order = wc_get_order( $order_id );

		if ( ! $order ) {
			return;
		}

		// 已經有碼就不動，也避免重複留註記。
		if ( ! empty( $order->get_meta( EGBIO_ACCESS_META_KEY ) ) ) {
			return;
		}

		// 沒有相符商品時說明原因，而不是靜默跳過。一個什麼痕跡都不留的
		// early return，會讓「外掛沒載入」「hook 沒觸發」「訂單裡沒有這個
		// 商品」三種完全不同的狀況看起來一模一樣，無從判斷——這正是本次
		// 排查卡住的原因。
		if ( ! egbio_order_has_ai_cancer_risk( $order ) ) {

			// 但「只買了完整報告」是已知的正常組合，安靜跳過。那個註記
			// 當初加上來的時候，代碼是唯一的商品；現在每一筆報告訂單都會
			// 跳一則寫著 skipped 的假警報，客服很快就會學會忽略訂單註記
			// ——那正好毀掉這些註記存在的理由。第 12 節會為報告商品留下
			// 它自己的說明。
			if (
				function_exists( 'egbio_order_has_report_product' )
				&& egbio_order_has_report_product( $order )
			) {
				return;
			}

			$seen = array();

			foreach ( $order->get_items( 'line_item' ) as $item ) {
				$product = $item->get_product();
				$seen[]  = $product
					? sprintf( '%s (SKU: %s)', $item->get_name(), $product->get_sku() ? $product->get_sku() : '無' )
					: sprintf( '%s (非商品項目，沒有 SKU)', $item->get_name() );
			}

			$order->add_order_note(
				sprintf(
					'AI access code skipped: 訂單中沒有 SKU 為 %s 的商品。實際項目：%s',
					EGBIO_PRODUCT_SKU,
					empty( $seen ) ? '（此訂單沒有任何項目）' : implode( ' ; ', $seen )
				)
			);
			$order->save();
			return;
		}

		$access_code = egbio_get_ai_access_code( $order );

		if ( is_wp_error( $access_code ) ) {
			// 留下痕跡而不是無聲失敗：否則客戶收到一封沒有代碼的信，
			// 而沒有任何地方記錄原因。
			$order->add_order_note(
				sprintf(
					'AI assessment access code could not be issued: %s',
					$access_code->get_error_message()
				)
			);
			$order->save();
			return;
		}

		$order->add_order_note(
			sprintf( 'AI assessment access code issued: %s', $access_code )
		);
		$order->save();
	}
}


/* ---------------------------------------------------------
 * 5. 在客戶付款完成後的 Email 顯示
 *
 * Processing Order / Completed Order
 * --------------------------------------------------------- */

add_action( 'woocommerce_email_after_order_table', 'egbio_add_ai_access_to_customer_email', 20, 4 );

if ( ! function_exists( 'egbio_add_ai_access_to_customer_email' ) ) {
	function egbio_add_ai_access_to_customer_email( $order, $sent_to_admin, $plain_text, $email ) {

		// 不放在管理員 Email
		if ( $sent_to_admin ) {
			return;
		}

		// 只處理 AI Cancer Risk 商品
		if ( ! egbio_order_has_ai_cancer_risk( $order ) ) {
			return;
		}

		// 只在付款後相關 Email 顯示
		$allowed_emails = array(
			'customer_processing_order',
			'customer_completed_order',
		);

		if ( ! isset( $email->id ) || ! in_array( $email->id, $allowed_emails, true ) ) {
			return;
		}

		$access_code = egbio_get_ai_access_code( $order );

		// 拿不到已登記的代碼時整段不輸出。印出一組進不去的碼會讓客戶
		// 以為是自己打錯，而訂單註記（見上）才是客服追查的依據。
		if ( is_wp_error( $access_code ) ) {
			return;
		}

		$assessment_url = EGBIO_ASSESSMENT_URL;


		/*
		 * Plain-text Email
		 */
		if ( $plain_text ) {

			echo "\n";
			echo "AI CANCER RISK ASSESSMENT\n";
			echo "----------------------------------\n";
			echo "Your assessment is ready.\n\n";

			echo "Assessment Link:\n";
			echo esc_url_raw( $assessment_url ) . "\n\n";

			echo "Access Code:\n";
			echo $access_code . "\n\n";

			echo "Please keep this access code for your records.\n";
			echo "\n";

			return;
		}


		/*
		 * HTML Email
		 */
		echo '
		<div style="
			margin:30px 0;
			padding:24px;
			border:1px solid #dbe5ee;
			border-radius:8px;
			background:#f7fbfd;
		">

			<h2 style="
				margin-top:0;
				color:#18364b;
			">
				AI Cancer Risk Assessment
			</h2>

			<p>
				Thank you for your purchase.
				Your AI Cancer Risk Assessment is ready.
			</p>

			<p>
				Please use the link below to begin your assessment:
			</p>

			<p style="margin:20px 0;">
				<a
					href="' . esc_url( $assessment_url ) . '"
					target="_blank"
					style="
						display:inline-block;
						padding:12px 22px;
						background:#2f9ed8;
						color:#ffffff;
						text-decoration:none;
						border-radius:5px;
						font-weight:bold;
					"
				>
					Start Your AI Cancer Risk Assessment
				</a>
			</p>

			<p>
				<strong>Assessment Link:</strong><br>
				<a
					href="' . esc_url( $assessment_url ) . '"
					target="_blank"
				>
					' . esc_html( $assessment_url ) . '
				</a>
			</p>

			<p style="
				margin-top:20px;
				font-size:16px;
			">
				<strong>Access Code:</strong>
				<span style="
					display:inline-block;
					margin-left:6px;
					padding:7px 12px;
					background:#ffffff;
					border:1px solid #ccd8e0;
					border-radius:4px;
					font-family:monospace;
					font-size:17px;
					letter-spacing:1px;
				">
					' . esc_html( $access_code ) . '
				</span>
			</p>

			<p style="
				margin-bottom:0;
				color:#667784;
				font-size:13px;
			">
				Please keep this access code for your records.
			</p>

		</div>
		';
	}
}


/* ---------------------------------------------------------
 * 6. 在 WooCommerce 後台訂單頁顯示 Access Code
 * --------------------------------------------------------- */

add_action( 'woocommerce_admin_order_data_after_billing_address', 'egbio_show_ai_access_code_in_admin', 20, 1 );

if ( ! function_exists( 'egbio_show_ai_access_code_in_admin' ) ) {
	function egbio_show_ai_access_code_in_admin( $order ) {

		if ( ! egbio_order_has_ai_cancer_risk( $order ) ) {
			return;
		}

		$access_code = $order->get_meta( EGBIO_ACCESS_META_KEY );

		if ( empty( $access_code ) ) {
			return;
		}

		echo '<p>
			<strong>
				AI Cancer Risk Access Code:
			</strong><br>
			<span style="
				font-family:monospace;
				font-size:15px;
			">'
			. esc_html( $access_code ) .
			'</span>
		</p>';
	}
}


/* =========================================================
 * 完整報告（付費 PDF）
 *
 * 與上面的評估代碼是兩個不同的商品，走兩條不同的路：
 *
 *   評估代碼 AI-CANCER-RISK    付款 → 鑄一組代碼 → 客戶填問卷
 *   完整報告 AI-CANCER-REPORT  付款 → 驗票券 → 產報告 → 寄附件
 *
 * 報告這條沒有代碼可發。客戶是從免費信裡的連結進來的，那條連結帶著一張
 * 簽章票券，指明要交付哪一份評估。票券由問卷平台簽發、由資料 API 驗證，
 * WordPress 只負責把它從網址搬到訂單上，再在付款完成時轉交出去——簽章
 * 密鑰**不放在這台**，這裡驗不了票，也不該驗。
 * ========================================================= */

if ( ! defined( 'EGBIO_REPORT_PRODUCT_SKU' ) ) {
	define( 'EGBIO_REPORT_PRODUCT_SKU', 'AI-CANCER-REPORT' );
}

if ( ! defined( 'EGBIO_REPORT_API_URL' ) ) {
	define( 'EGBIO_REPORT_API_URL', 'https://egbiomed-ai-data-api-freycna5dghng2d0.westus2-01.azurewebsites.net/api/reports/purchase' );
}

if ( ! defined( 'EGBIO_REPORT_TICKET_META_KEY' ) ) {
	define( 'EGBIO_REPORT_TICKET_META_KEY', '_egbio_report_ticket' );
}

if ( ! defined( 'EGBIO_REPORT_DELIVERY_META_KEY' ) ) {
	define( 'EGBIO_REPORT_DELIVERY_META_KEY', '_egbio_report_delivery_requested' );
}

if ( ! defined( 'EGBIO_REPORT_SESSION_KEY' ) ) {
	define( 'EGBIO_REPORT_SESSION_KEY', 'egbio_report_ticket' );
}


/* ---------------------------------------------------------
 * 7. 票券的形狀
 *
 * base64url 的 payload、一個點、64 碼小寫十六進位的簽章。這裡只檢查
 * 形狀，不檢查簽章——簽章密鑰在資料 API 那端。形狀不對的東西連存進
 * session 都不必，省得一路帶到付款才失敗。
 * --------------------------------------------------------- */

if ( ! function_exists( 'egbio_is_report_ticket_shaped' ) ) {
	function egbio_is_report_ticket_shaped( $ticket ) {
		return is_string( $ticket ) && (bool) preg_match( '/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/', $ticket );
	}
}


/* ---------------------------------------------------------
 * 8. 從網址接下票券，存進購物車工作階段
 *
 * 免費信裡的連結長這樣：
 *   https://mdi.eg-bio.com/?add-to-cart=<商品ID>&egbio_ticket=<票券>
 *
 * 優先序必須小於 20。WooCommerce 自己的 WC_Form_Handler::add_to_cart_action
 * 也掛在 wp_loaded、優先序也是 20，而同優先序誰先跑取決於外掛載入順序——
 * 那不是這個外掛能決定的事。順序一旦翻過來，票券還沒存進 session，第 9 節
 * 那道防線就會把從自己信裡點進來的客戶擋掉：付費這條路整條斷掉，而且只在
 * 特定環境重現。
 *
 * wp_loaded 比 init 晚，所以優先序調早不影響 WC()->session 是否已就緒。
 * --------------------------------------------------------- */

add_action( 'wp_loaded', 'egbio_capture_report_ticket', 5 );

if ( ! function_exists( 'egbio_capture_report_ticket' ) ) {
	function egbio_capture_report_ticket() {

		if ( ! isset( $_GET['egbio_ticket'] ) ) {
			return;
		}

		if ( ! function_exists( 'WC' ) || ! WC()->session ) {
			return;
		}

		$ticket = sanitize_text_field( wp_unslash( $_GET['egbio_ticket'] ) );

		if ( ! egbio_is_report_ticket_shaped( $ticket ) ) {
			return;
		}

		WC()->session->set( EGBIO_REPORT_SESSION_KEY, $ticket );
	}
}


/* ---------------------------------------------------------
 * 9. 沒有票券就不准把報告加入購物車
 *
 * 這是本段最重要的一道防線。沒有票券，資料 API 不知道要交付哪一份評估，
 * 報告就產不出來——而那時錢已經收了。寧可在加入購物車就擋下來，讓客戶
 * 回頭去點自己信裡的連結，也不要收了錢再回頭退款。
 * --------------------------------------------------------- */

add_filter( 'woocommerce_add_to_cart_validation', 'egbio_require_ticket_for_report', 10, 3 );

if ( ! function_exists( 'egbio_require_ticket_for_report' ) ) {
	function egbio_require_ticket_for_report( $passed, $product_id, $quantity ) {

		$product = wc_get_product( $product_id );

		if ( ! $product || $product->get_sku() !== EGBIO_REPORT_PRODUCT_SKU ) {
			return $passed;
		}

		$ticket = ( function_exists( 'WC' ) && WC()->session )
			? WC()->session->get( EGBIO_REPORT_SESSION_KEY )
			: '';

		if ( egbio_is_report_ticket_shaped( $ticket ) ) {
			return $passed;
		}

		wc_add_notice(
			'請從您收到的評估結果 Email 中的「取得完整報告」按鈕進入，該連結會指明要產生哪一份報告。直接加入購物車無法辨識您的評估結果。',
			'error'
		);

		return false;
	}
}


/* ---------------------------------------------------------
 * 9b. 加入購物車之後直接前往結帳
 *
 * 免費信的連結指向網站根目錄，所以加入購物車之後使用者會停在首頁，
 * 面對一個他沒有理由待在那裡的畫面——他按的是「取得完整報告」，不是
 * 「去逛商店」。
 *
 * 用重新導向而不是把連結直接指向結帳頁，是因為順便解決了另一件事：
 * 網址裡的 add-to-cart 參數在重新整理時會再觸發一次。停在帶著參數的
 * 頁面上按 F5，購物車就會變成兩份——付兩份錢，只會交付一份報告。
 * 導向之後網址上不再有那個參數，重新整理是安全的。
 *
 * 只對報告商品生效。評估代碼那個商品維持原本的行為。
 * --------------------------------------------------------- */

add_filter( 'woocommerce_add_to_cart_redirect', 'egbio_report_redirect_to_checkout', 10, 2 );

if ( ! function_exists( 'egbio_report_redirect_to_checkout' ) ) {
	function egbio_report_redirect_to_checkout( $url, $adding_to_cart = null ) {

		if ( ! $adding_to_cart instanceof WC_Product ) {
			return $url;
		}

		if ( $adding_to_cart->get_sku() !== EGBIO_REPORT_PRODUCT_SKU ) {
			return $url;
		}

		$checkout = function_exists( 'wc_get_checkout_url' ) ? wc_get_checkout_url() : '';

		// 結帳頁找不到時交還原本的網址，而不是回傳空字串——空字串會讓
		// WooCommerce 不導向，使用者仍在首頁，但至少商品有進購物車。
		return $checkout ? $checkout : $url;
	}
}


/* ---------------------------------------------------------
 * 10. 結帳時把票券寫進訂單
 *
 * 工作階段會過期、會被清空；訂單不會。從這一刻起，這筆訂單自己記得它
 * 要交付哪一份評估。
 * --------------------------------------------------------- */

add_action( 'woocommerce_checkout_create_order', 'egbio_attach_report_ticket_to_order', 10, 2 );

if ( ! function_exists( 'egbio_attach_report_ticket_to_order' ) ) {
	function egbio_attach_report_ticket_to_order( $order, $data ) {

		if ( ! function_exists( 'WC' ) || ! WC()->session ) {
			return;
		}

		$ticket = WC()->session->get( EGBIO_REPORT_SESSION_KEY );

		if ( ! egbio_is_report_ticket_shaped( $ticket ) ) {
			return;
		}

		$order->update_meta_data( EGBIO_REPORT_TICKET_META_KEY, $ticket );
	}
}


/* ---------------------------------------------------------
 * 11. 判斷訂單中是否包含完整報告
 * --------------------------------------------------------- */

if ( ! function_exists( 'egbio_order_has_report_product' ) ) {
	function egbio_order_has_report_product( $order ) {

		if ( ! $order instanceof WC_Order ) {
			return false;
		}

		foreach ( $order->get_items( 'line_item' ) as $item ) {

			$product = $item->get_product();

			if ( $product && $product->get_sku() === EGBIO_REPORT_PRODUCT_SKU ) {
				return true;
			}
		}

		return false;
	}
}


/* ---------------------------------------------------------
 * 12. 付款完成後，請資料 API 交付報告
 *
 * 與第 4 節掛在同一組 hook、同一個優先序，兩者互不干擾：一筆訂單裡可以
 * 同時有評估代碼與完整報告，各自處理各自的商品。
 *
 * 這裡**不寄任何信**，也不知道報告長什麼樣。它只是通知資料 API「這筆訂單
 * 付款了」，由那邊驗票、比對存檔、觸發交付流程。決定要不要交付的判斷全在
 * 那一端——WordPress 是本系統中最暴露的元件，不該握有那個權力。
 *
 * 端點依 order_reference 冪等，所以 WooCommerce 重送 webhook、訂單經過
 * 多個已付款狀態，都不會重複寄出報告。
 * --------------------------------------------------------- */

add_action( 'woocommerce_order_status_processing', 'egbio_request_report_delivery', 5, 1 );
add_action( 'woocommerce_order_status_completed', 'egbio_request_report_delivery', 5, 1 );

if ( ! function_exists( 'egbio_request_report_delivery' ) ) {
	function egbio_request_report_delivery( $order_id ) {

		$order = wc_get_order( $order_id );

		if ( ! $order ) {
			return;
		}

		// 不含報告商品就與這一段無關，安靜返回：這是唯一不留註記的 early
		// return，因為每一筆只買了評估代碼的訂單都會走到這裡，留註記只會
		// 把真正的問題淹掉。第 4 節已經會為它自己的商品留下說明。
		if ( ! egbio_order_has_report_product( $order ) ) {
			return;
		}

		// 已經請求過就不再請求，也避免重複留註記。
		if ( ! empty( $order->get_meta( EGBIO_REPORT_DELIVERY_META_KEY ) ) ) {
			return;
		}

		$ticket = $order->get_meta( EGBIO_REPORT_TICKET_META_KEY );

		// 走到這裡卻沒有票券，代表第 9 節那道防線被繞過了（例如後台手動
		// 建立訂單）。錢已經收了，所以這一定要留下痕跡並讓人處理。
		if ( ! egbio_is_report_ticket_shaped( $ticket ) ) {
			$order->add_order_note(
				'完整報告無法交付：這筆訂單沒有票券，無法判斷要交付哪一份評估。'
				. '請確認客戶是否從結果 Email 的連結進入結帳；必要時請以人工方式處理。'
			);
			$order->save();
			return;
		}

		if ( ! defined( 'EGBIO_PURCHASE_API_KEY' ) || ! EGBIO_PURCHASE_API_KEY ) {
			$order->add_order_note( '完整報告無法交付：EGBIO_PURCHASE_API_KEY 未設定。' );
			$order->save();
			return;
		}

		$response = wp_remote_post(
			EGBIO_REPORT_API_URL,
			array(
				'timeout' => 30,
				'headers' => array(
					'Content-Type'             => 'application/json',
					'x-egbiomed-purchase-key'  => EGBIO_PURCHASE_API_KEY,
				),
				'body'    => wp_json_encode(
					array(
						'ticket'          => $ticket,
						'order_reference' => 'wc-order-' . $order->get_id(),
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			$order->add_order_note(
				sprintf( '完整報告交付請求失敗（無法連線）：%s', $response->get_error_message() )
			);
			$order->save();
			return;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code < 200 || $code >= 300 ) {
			// 把 API 的錯誤原樣記下來。它的訊息是刻意寫得可讀的：票券無效、
			// 找不到評估結果、該筆評估早於輸入存檔——三種完全不同的處置。
			$order->add_order_note(
				sprintf(
					'完整報告交付請求被拒（HTTP %d）：%s',
					$code,
					isset( $body['error'] ) ? $body['error'] : wp_remote_retrieve_body( $response )
				)
			);
			$order->save();
			return;
		}

		// 只有成功才記旗標。失敗時不記，下一次狀態變更（例如 processing →
		// completed）會再試一次，而不是把一筆付了錢的訂單永遠擱在那裡。
		$order->update_meta_data( EGBIO_REPORT_DELIVERY_META_KEY, current_time( 'mysql' ) );

		$order->add_order_note(
			sprintf(
				'完整報告已請求交付%s。報告將由系統直接寄至客戶填寫評估時使用的 Email。',
				( isset( $body['reused'] ) && $body['reused'] ) ? '（此訂單先前已請求過，未重複寄送）' : ''
			)
		);
		$order->save();
	}
}


/* ---------------------------------------------------------
 * 13. 後台訂單頁顯示票券狀態
 *
 * 不顯示票券本身——它很長，而且看了也無從判斷對錯。顯示的是客服真正需要
 * 知道的：這筆訂單有沒有票券、交付請求送出了沒有。
 * --------------------------------------------------------- */

add_action( 'woocommerce_admin_order_data_after_billing_address', 'egbio_show_report_status_in_admin', 21, 1 );

if ( ! function_exists( 'egbio_show_report_status_in_admin' ) ) {
	function egbio_show_report_status_in_admin( $order ) {

		if ( ! egbio_order_has_report_product( $order ) ) {
			return;
		}

		$ticket    = $order->get_meta( EGBIO_REPORT_TICKET_META_KEY );
		$delivered = $order->get_meta( EGBIO_REPORT_DELIVERY_META_KEY );

		echo '<p><strong>完整報告</strong><br />票券：'
			. ( egbio_is_report_ticket_shaped( $ticket ) ? '✅ 已附加' : '❌ 缺少（無法交付）' )
			. '<br />交付請求：'
			. ( $delivered ? '✅ 已送出 ' . esc_html( $delivered ) : '⏳ 尚未送出（請查看訂單註記）' )
			. '</p>';
	}
}
