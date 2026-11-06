#!/usr/bin/env bash
# Настройка прямого интернет-эквайринга УБРиР (TXPG) на сервере сайта доставки Varim.
# Запуск на сервере:  wget -q raw.githubusercontent.com/vt648209-debug/varim-beach-order/main/txpg-setup.sh; bash txpg-setup.sh
set -u
APP=/opt/varim-beach-order
ENV="$APP/backend/.env"
LOGIN=50008089
CANDIDATES=("https://tf.ubrr.ru:23555/api" "https://tf.ubrr.ru:23555")

echo "=== 1. Обновляю код сайта с GitHub ==="
cd "$APP" || { echo "Нет папки $APP"; exit 1; }
git pull --ff-only || { echo "git pull не удался"; exit 1; }
git log --oneline -1
cd "$APP/backend" && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 && echo "Зависимости обновлены"

echo
echo "=== 2. Проверка доступа к шлюзу банка ==="
read -s -p "Введите пароль логина терминала $LOGIN и нажмите Enter: " PASS; echo
FOUND=""
for B in "${CANDIDATES[@]}"; do
  BODY=$(curl -s -m 20 -u "$LOGIN:$PASS" -H 'Content-Type: application/json' -w '\nHTTP=%{http_code}' "$B/order/1?password=x" 2>&1)
  CODE=$(echo "$BODY" | sed -n 's/^HTTP=//p')
  TEXT=$(echo "$BODY" | sed '/^HTTP=/d' | tr -d '\n' | cut -c1-200)
  echo "$B  ->  HTTP $CODE  $TEXT"
  if [ "$CODE" != "404" ] && [ "$CODE" != "000" ] && ! echo "$TEXT" | grep -qi "AuthorizationNeeded\|session_expired\|<html"; then
    FOUND="$B"; break
  fi
done

if [ -z "$FOUND" ]; then
  echo
  echo "Шлюз не подтвердился. Сайт продолжает работать как раньше (оплата курьеру)."
  echo "Нужен адрес API TXPG от банка: 8 800 700-59-59. Скриншот этого экрана отправьте Claude."
  exit 0
fi

echo
echo "=== 3. Шлюз отвечает: $FOUND — записываю настройки ==="
cp "$ENV" "$ENV.bak.$(date +%Y%m%d%H%M%S)"
sed -i '/^TXPG_BASE_URL=/d;/^TXPG_USER=/d;/^TXPG_PASSWORD=/d' "$ENV"
{
  echo "TXPG_BASE_URL=$FOUND"
  echo "TXPG_USER=$LOGIN"
  echo "TXPG_PASSWORD=$PASS"
} >> "$ENV"
chmod 600 "$ENV"
systemctl restart varim-backend
sleep 3
systemctl is-active varim-backend
journalctl -u varim-backend -n 15 --no-pager | grep -v -i password
echo
echo "Готово. Отправьте скриншот этого экрана Claude."
