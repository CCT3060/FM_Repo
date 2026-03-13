# Frontend Deployment Notes

## Local development

Create `.env` with:

```env
VITE_API_URL=http://localhost:4000
```

Run:

```bash
npm install
npm run dev
```

## Production

Set these environment variables in Amplify before building:

```env
VITE_API_URL=https://your-api-domain.example.com
VITE_PUBLIC_APP_URL=https://your-frontend-domain.example.com
```

Requirements:

- `VITE_API_URL` must be HTTPS in production.
- Do not point the frontend at `http://...elasticbeanstalk.com` from an HTTPS site, or the browser will block requests as mixed content.
- The backend `ALLOW_ORIGIN` value in Elastic Beanstalk must include your Amplify domain.

Example backend env value:

```env
ALLOW_ORIGIN=http://localhost:5173,https://your-frontend-domain.example.com
```

## Elastic Beanstalk reminder

If your Elastic Beanstalk environment only responds on HTTP, the frontend still will not connect from Amplify. HTTPS must be terminated at an Application Load Balancer, CloudFront, or another TLS-enabled endpoint before the frontend build points to it.
