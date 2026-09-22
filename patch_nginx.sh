#!/bin/bash
if ! grep -q 'location /pgadmin/' /etc/nginx/sites-available/zeroleak_track; then
  sed -i '/location \/ {/i \
    location /pgadmin/ {\
        proxy_pass http://127.0.0.1:5050/;\
        proxy_set_header X-Script-Name /pgadmin;\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto $scheme;\
        proxy_redirect off;\
    }\
' /etc/nginx/sites-available/zeroleak_track
  nginx -t && systemctl reload nginx
fi
