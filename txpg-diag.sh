#!/usr/bin/env bash
# Диагностика связи сервера с шлюзом УБРиР (без паролей)
H=tf.ubrr.ru; P=23555
echo "=== DNS ==="; getent hosts $H || echo "DNS не резолвится"
echo "=== TCP порт $P ==="; timeout 8 bash -c "</dev/tcp/$H/$P" && echo "порт открыт" || echo "порт НЕ доступен (таймаут/закрыт)"
echo "=== TCP порт 443 ==="; timeout 8 bash -c "</dev/tcp/$H/443" && echo "443 открыт" || echo "443 НЕ доступен"
echo "=== TLS со проверкой сертификата ==="; curl -s -o /dev/null -m 15 -w "HTTP %{http_code}\n" https://$H:$P/mp/ 2>&1; echo "curl код выхода: $?"
echo "=== TLS без проверки сертификата ==="; curl -sk -o /dev/null -m 15 -w "HTTP %{http_code}\n" https://$H:$P/mp/ 2>&1; echo "curl код выхода: $?"
echo "=== Внешний IP сервера ==="; curl -s -m 10 https://api.ipify.org; echo
