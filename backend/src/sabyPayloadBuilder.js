import { config } from "./config.js";
import { MENU_MAP, ZONES } from "./mapping.js";

function formatSabyDatetime(date, timeZone) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(date); const get = function (type) { return parts.find(function (p) { return p.type === type; }).value; }; return get("year") + "-" + get("month") + "-" + get("day") + " " + get("hour") + ":" + get("minute") + ":" + get("second"); } export function buildSabyPayload(order) {
  const nomenclatures = order.items.map(function (it) {
    const item = MENU_MAP[it.id];
    if (!item) throw new Error("Неизвестный товар: " + it.id);
    return {
      nomNumber: item.nomNumber,
      priceListId: item.priceListId || config.saby.priceListId,
      count: it.qty,
      cost: item.price,
      name: item.name,
    };
  });

const total = nomenclatures.reduce(function (s, n) { return s + n.cost * n.count; }, 0);

const zoneName = ZONES[order.zoneId] || order.zoneId;
  const parts = [
    "Пляж: " + zoneName,
    order.landmark ? ("Ориентир: " + order.landmark) : null,
    order.comment || null,
    ];
  const fullComment = parts.filter(Boolean).join(". ");

const now = new Date();
  const datetime = formatSabyDatetime(new Date(now.getTime() + 60000 * Number(process.env.ORDER_LEAD_MINUTES || 20)), "Europe/Moscow");

let delivery;
  if (config.saby.deliveryMode === "zone") {
    delivery = {
      isPickup: false,
      paymentType: order.payment,
      persons: 1,
      addressJSON: {
        settlement: "Городской пляж",
        comment: fullComment,
        isFormalized: false,
      },
    };
  } else {
    delivery = {
      isPickup: true,
      paymentType: order.payment,
      persons: 1,
    };
  }

return {
  payload: {
    product: "delivery",
    pointId: config.saby.pointId,
    comment: fullComment,
    customer: { name: order.customer.name, phone: order.customer.phone },
    datetime: datetime,
    nomenclatures: nomenclatures,
    delivery: delivery,
  },
  total: total,
};
}
