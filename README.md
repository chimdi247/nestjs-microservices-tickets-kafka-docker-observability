<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

---

## Web client: end-to-end flows

The Next.js client (`client/`, port 4000) talks only to the API gateway (`NEXT_PUBLIC_API_BASE_URL`).

| Page | Who | What it does |
|------|-----|--------------|
| `/` | everyone | upcoming events, personal greeting and shortcuts |
| `/events`, `/events/:id` | everyone | catalogue with search, live seats left, ticket booking (sign-in required to book) |
| `/tickets` | signed-in | my tickets with codes, cancel before the event starts |
| `/organizer` | organizer / admin | my events: publish, cancel, manage |
| `/organizer/events/new`, `/organizer/events/:id/edit` | organizer / admin | create / edit an event |
| `/organizer/events/:id` | organizer / admin | seats sold, revenue, attendee list, per-ticket check-in |
| `/organizer/check-in` | organizer / admin | check a guest in by ticket code |

Sign up with "I want to organize events" to get the organizer role (`ADMIN` is never self-assignable;
`admin@example.com / password123` is seeded). Fresh databases also get four demo events (`03-demo-events.sql`).
Prices are stored in cents.

### Consistency guarantees

- **No overselling**: ticket purchase runs in one transaction holding a row lock (`SELECT ... FOR UPDATE`) on the event;
  event update and cancel take the same lock.
- **One definition of "seats taken"** (`ACTIVE_TICKET_STATUSES`: PENDING, CONFIRMED, CHECKED_IN) shared by the
  events-service (availability shown in the UI) and the tickets-service (purchase check).
- **Event cancel cascades**: the event and all its unused tickets are cancelled in one transaction; attendees get an e-mail.
- Capacity cannot be lowered below sold seats; cancelled events cannot be edited/published; past events cannot be booked.
- Check-in and ticket cancel use conditional updates, so racing requests cannot double-apply.
- JWT carries the role; the gateway forwards `x-user-id` / `x-user-role` and the services enforce ownership
  (organizer or admin). Only organizers/admins can create events.
- Gateway CORS origins: `CORS_ORIGINS` (comma separated); rate limits raised for browser use (see `.env.example`).


---

## Payments (Stripe Checkout)

Paid events are paid with [Stripe Checkout](https://stripe.com/docs/payments/checkout) (hosted page, USD).
Free events (price 0) are confirmed instantly and never touch Stripe. Minimum paid price: $0.50.

```
client -- POST /tickets/purchase --> gateway -> tickets-service
            (one transaction, event row locked: seats held, ticket = PENDING, expires_at = now + 30 min)
        <-- { ticket, checkoutUrl } -- tickets-service -> payments-service -> Stripe (create session)
client --> redirect to Stripe, pays --> Stripe --webhook--> gateway /payments/webhook -> payments-service
            (signature verified on the RAW body; event id stored => duplicate deliveries are ignored)
            payment = PAID, ticket = CONFIRMED, Kafka: payment.completed + ticket.purchased (=> e-mail)
```

| Situation | What happens |
|-----------|--------------|
| Not paid within the window | tickets-service job cancels the PENDING ticket (seats freed); payments-service closes the Stripe session |
| User cancels a PENDING booking | seats freed at once, session closed |
| User cancels a paid ticket / organizer cancels the event | ticket is CANCELLED, then the payments-service reconcile job (every 30 s) refunds the PAID payment through Stripe and e-mails the user. A failed refund stays PAID and is retried |
| Payment arrives after the booking expired | recorded as PAID, the reconcile job refunds it automatically |
| Refund made in the Stripe dashboard | `charge.refunded` webhook cancels the ticket |

### Setup

1. **Database migrations are automatic**: the one-shot `db-migrate` container applies every file in
   `docker/postgres/migrations/` (idempotent) on each `docker compose up`, before the app services start.
   (The Postgres init scripts only run on an empty volume, which is why existing databases need this.)
2. Put your **test** keys in `.env` (see `.env.example`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
   `CLIENT_URL` (the public URL of the web client; Stripe redirects the browser back to it).
3. Deliver webhooks. Locally (newer Stripe CLIs require `--events`):
   `stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,charge.refunded --forward-to localhost:3000/payments/webhook`
   (prints the `whsec_...` secret; put it in `.env` as `STRIPE_WEBHOOK_SECRET` and restart the payments-service). In production add the endpoint `https://<gateway>/payments/webhook` in the Stripe dashboard with the events
   `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` and `charge.refunded`.
4. `docker compose up -d --build`. Pay with the test card `4242 4242 4242 4242` (any future date, any CVC).

Without `STRIPE_SECRET_KEY` the platform still runs: free events work, paid events answer
"Payments are not configured" and hold no seats.
