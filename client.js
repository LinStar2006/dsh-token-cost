window.__ModuleLoader__.load({
	id: "dsh-token-cost",
	factory(require) {
		const React = require("react");
		const createPortal = require("react-dom").createPortal;
		const h = React.createElement;
		/** Locale namespace of this plugin. */
		const NS = "token-cost";

		/** Chinese copy. */
		const zh = {
			"panel.title": "本会话花费",
			"panel.requests": "模型请求",
			"panel.inputMiss": "输入 · 未命中缓存",
			"panel.inputHit": "输入 · 命中缓存",
			"panel.inputWrite": "输入 · 写入缓存",
			"panel.output": "输出",
			"panel.peak": "高峰时段",
			"panel.offpeak": "空闲时段",
			"panel.unpriced": "未收录价目的请求",
			"panel.note": "价目表来自 DeepSeek 官方定价：deepseek-flash 未命中 ¥1/M、命中 ¥0.02/M、输出 ¥4/M（空闲档，高峰档 ×2）。高峰时段为北京时间周一至周五 9:00–12:00 与 14:00–18:00（法定节假日除外）；周末与法定节假日全天按空闲档计价，调休补班日即使落在周六周日也按空闲档计价。不含子代理会话的花费。",
			"panel.holidays": "节假日数据",
			"panel.titleValue": "精确金额",
		};

		/** English copy. */
		const en = {
			"panel.title": "Conversation cost",
			"panel.requests": "Model requests",
			"panel.inputMiss": "Input · cache miss",
			"panel.inputHit": "Input · cache hit",
			"panel.inputWrite": "Input · cache write",
			"panel.output": "Output",
			"panel.peak": "Peak band",
			"panel.offpeak": "Off-peak band",
			"panel.unpriced": "Unpriced requests",
			"panel.note": "Prices follow the official DeepSeek price list: deepseek-flash ¥1/M miss, ¥0.02/M hit, ¥4/M output (off-peak; peak is 2x). Peak band is Beijing time Monday to Friday 09:00–12:00 and 14:00–18:00, excluding statutory holidays. Weekends and statutory holidays are off-peak all day, and make-up workdays keep the off-peak band even when they fall on a weekend. Sub-agent conversations are not included.",
			"panel.holidays": "Holiday data",
			"panel.titleValue": "Exact amount",
		};

		/**
		 * Pill and dialog styles, mirroring the host composer stat pills so the
		 * new control sits visually flush with the activity and usage ones.
		 */
		const css = [
			".dshtc_anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}",
			".dshtc_pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}",
			".dshtc_pill svg{flex:none;width:14px;height:14px}",
			"button.dshtc_pill{cursor:pointer}",
			"button.dshtc_pill:hover,button.dshtc_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}",
			".dshtc_label{text-overflow:ellipsis;min-width:0;overflow:hidden}",
			".dshtc_panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}",
			".dshtc_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}",
			".dshtc_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}",
			".dshtc_titleLabel svg{flex:none;width:14px;height:14px}",
			".dshtc_titleValue{font-variant-numeric:tabular-nums}",
			".dshtc_titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}",
			".dshtc_details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}",
			".dshtc_details dt,.dshtc_details dd{min-width:0;margin:0}",
			".dshtc_details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}",
			".dshtc_note{color:var(--dsw-alias-label-tertiary);border-top:.5px solid var(--dsw-alias-border-l2);margin-top:10px;padding-top:8px;line-height:16px}",
		].join("");

		/** Panel margin kept free of the viewport edge. */
		const PANEL_MARGIN = 12;
		/** Distance between the trigger's top edge and the panel's bottom. */
		const PANEL_GAP = 8;
		/** Unplaced portal panel: laid out but hidden so the first measure pass is real. */
		const MEASURE_STYLE = { visibility: "hidden", left: 0, top: 0 };

		/** Formatted yuan amount for an integer micro-yuan total. */
		function formatYuan(micros) {
			const yuan = (Number.isFinite(micros) ? micros : 0) / 1e6;
			if (yuan <= 0) return "¥0";
			const trim = (text) => text.replace(/0+$/, "").replace(/\.$/, "");
			if (yuan < 1e-3) return "¥" + trim(yuan.toFixed(6));
			if (yuan < 1e-2) return "¥" + trim(yuan.toFixed(5));
			if (yuan < 1) return "¥" + trim(yuan.toFixed(4));
			return "¥" + yuan.toFixed(2);
		}

		/** Exact amount, six decimals, for the dialog header. */
		function formatYuanExact(micros) {
			const yuan = (Number.isFinite(micros) ? micros : 0) / 1e6;
			return "¥" + yuan.toFixed(6);
		}

		/** Token count with thousand separators. */
		function formatTokens(value) {
			const count = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
			return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
		}

		/** The cost-of-conversation icon: a coin with a yuan mark. */
		function CostIcon() {
			return h(
				"svg",
				{ viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", "aria-hidden": true },
				h("circle", { cx: 8, cy: 8, r: 6.2 }),
				h("path", { d: "M5.7 4.6 8 8.2l2.3-3.6" }),
				h("path", { d: "M8 8.2v3.3" }),
				h("path", { d: "M6.1 9.2h3.8" }),
			);
		}

		/**
		 * One trigger-anchored dialog seat: open state, viewport-clamped placement
		 * above the trigger (falling back below when there is no room), and
		 * outside-click / Escape dismissal.
		 */
		function useSeat() {
			const [open, setOpen] = React.useState(false);
			const rootRef = React.useRef(null);
			const panelRef = React.useRef(null);
			const [pos, setPos] = React.useState(null);
			React.useLayoutEffect(() => {
				if (!open) {
					setPos(null);
					return undefined;
				}
				const place = () => {
					const anchor = rootRef.current;
					const panel = panelRef.current;
					if (anchor === null || panel === null) return;
					const rect = anchor.getBoundingClientRect();
					const width = panel.offsetWidth;
					const height = panel.offsetHeight;
					const left = Math.min(Math.max(PANEL_MARGIN, rect.left), Math.max(PANEL_MARGIN, window.innerWidth - PANEL_MARGIN - width));
					const above = rect.top - PANEL_GAP - height;
					const top =
						above >= PANEL_MARGIN
							? above
							: Math.min(rect.bottom + PANEL_GAP, Math.max(PANEL_MARGIN, window.innerHeight - PANEL_MARGIN - height));
					setPos({ left: Math.round(left), top: Math.round(top) });
				};
				place();
				const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
				if (observer !== null && panelRef.current !== null) observer.observe(panelRef.current);
				window.addEventListener("resize", place);
				window.addEventListener("scroll", place, true);
				return () => {
					if (observer !== null) observer.disconnect();
					window.removeEventListener("resize", place);
					window.removeEventListener("scroll", place, true);
				};
			}, [open]);
			React.useEffect(() => {
				if (!open) return undefined;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				const onPointerDown = (event) => {
					const target = event.target;
					if (!(target instanceof Node)) return;
					if (rootRef.current !== null && rootRef.current.contains(target)) return;
					if (panelRef.current !== null && panelRef.current.contains(target)) return;
					setOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				document.addEventListener("pointerdown", onPointerDown, true);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
					document.removeEventListener("pointerdown", onPointerDown, true);
				};
			}, [open]);
			return { open, setOpen, rootRef, panelRef, pos };
		}

		/** The dialog body once the projection has data. */
		function CostPanel({ cost, t }) {
			const rows = [];
			rows.push([t("panel.requests"), formatTokens(cost.requests)]);
			rows.push([t("panel.inputMiss"), formatTokens(cost.missTokens)]);
			rows.push([t("panel.inputHit"), formatTokens(cost.hitTokens)]);
			if (cost.writeTokens > 0) rows.push([t("panel.inputWrite"), formatTokens(cost.writeTokens)]);
			rows.push([t("panel.output"), formatTokens(cost.outTokens)]);
			if (cost.peakMicros > 0) rows.push([t("panel.peak"), formatYuan(cost.peakMicros)]);
			if (cost.offpeakMicros > 0) rows.push([t("panel.offpeak"), formatYuan(cost.offpeakMicros)]);
			if (cost.unpricedRequests > 0) rows.push([t("panel.unpriced"), formatTokens(cost.unpricedRequests)]);
			const models = Array.isArray(cost.models) ? cost.models : [];
			const pieces = [];
			for (const [index, row] of rows.entries()) {
				pieces.push(h("dt", { key: "dt" + index }, row[0]));
				pieces.push(h("dd", { key: "dd" + index }, row[1]));
			}
			for (const [index, model] of models.entries()) {
				pieces.push(h("dt", { key: "mdt" + index }, model.name));
				pieces.push(h("dd", { key: "mdd" + index }, formatTokens(model.requests) + " × · " + formatYuan(model.costMicros)));
			}
			return h(
				React.Fragment,
				null,
				h("dl", { className: "dshtc_details" }, pieces),
				h("div", { className: "dshtc_note" }, t("panel.note")),
				cost.holidayCoverage
					? h("div", { className: "dshtc_note" }, t("panel.holidays") + ": " + cost.holidayCoverage)
					: null,
			);
		}

		/**
		 * Cost pill in the composer dock: shows the running total for this
		 * conversation and opens a breakdown dialog on click.
		 */
		function BillingPill({ useProjection, t }) {
			const cost = useProjection("tokenCost");
			const seat = useSeat();
			if (cost === undefined || cost === null || !(cost.requests > 0)) return null;
			const amount = formatYuan(cost.costMicros);
			const label = t("panel.title");
			const title = cost.unpricedRequests > 0 && cost.costMicros === 0 ? "—" : amount;
			return h(
				"span",
				{ ref: seat.rootRef, className: "dshtc_anchor", "data-composer-stat": "billing" },
				h(
					"button",
					{
						type: "button",
						className: "dshtc_pill",
						"aria-haspopup": "dialog",
						"aria-expanded": seat.open,
						"aria-label": label + " " + formatYuanExact(cost.costMicros),
						title: label + " " + formatYuanExact(cost.costMicros),
						onClick: () => seat.setOpen(!seat.open),
					},
					h(CostIcon, null),
					h("span", { className: "dshtc_label" }, title),
				),
				seat.open
					? createPortal(
							h(
								"div",
								{
									ref: seat.panelRef,
									className: "dshtc_panel",
									role: "dialog",
									"aria-label": label,
									style: seat.pos ?? MEASURE_STYLE,
								},
								h(
									"div",
									{ className: "dshtc_title" },
									h("span", { className: "dshtc_titleLabel" }, h(CostIcon, null), label),
									h("span", { className: "dshtc_titleValue" }, formatYuanExact(cost.costMicros)),
								),
								h("div", { className: "dshtc_titleRule" }),
								h(CostPanel, { cost, t }),
							),
							document.body,
						)
					: null,
			);
		}

		/** Report a non-fatal registration failure without taking the Web boot down. */
		function reportFailure(label, error) {
			const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error);
			console.error(`[dsh-token-cost] ${label}: ${detail}`);
			try {
				window.localStorage.setItem(
					"dsh-token-cost:last-error",
					JSON.stringify({ at: new Date().toISOString(), label, detail }),
				);
			} catch (_storageUnavailable) {
				/* localStorage may be unavailable; the console line above is enough. */
			}
		}

		/**
		 * Run one registration step. A third-party bundle must never fail the whole
		 * Web boot, so an unexpected error is reported and the remaining entries keep
		 * working.
		 */
		function guarded(label, step) {
			try {
				step();
			} catch (error) {
				reportFailure(label, error);
			}
		}

		/** Register locale, styles and the composer dock entry. */
		function apply(ctx) {
			guarded("locale", () => ctx.effect(() => ctx.locale.register(NS, { zh, en }), "token-cost: locale"));
			guarded("styles", () =>
				ctx.effect(() => {
					const tag = document.createElement("style");
					tag.dataset.plugin = "dsh-token-cost";
					tag.textContent = css;
					document.head.appendChild(tag);
					return () => tag.remove();
				}, "token-cost: styles"),
			);
			guarded("billing pill", () =>
				ctx.slots.inject("conversation.composer.dock", () =>
					ctx.slots.register(
						{ name: "conversation.composer.dock", id: "billing", order: 2, locale: NS },
						BillingPill,
					),
				),
			);
		}

		return { inject: ["slots", "locale"], apply };
	},
});
