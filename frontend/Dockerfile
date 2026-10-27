FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY . /usr/share/nginx/html

RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/nginx.conf \
          /usr/share/nginx/html/README.md \
          /usr/share/nginx/html/.dockerignore 2>/dev/null || true

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
