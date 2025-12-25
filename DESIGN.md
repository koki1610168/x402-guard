```
x402-guard/
├── README.md
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example
│
├── src/
│   ├── index.ts            # Public SDK entry
│   ├── guard.ts            # Core guard logic
│   ├── policy/
│   │   ├── policy.ts       # Policy interface
│   │   ├── budget.ts       # Budget rules
│   │   └── conditions.ts   # Conditional checks
│   │
│   ├── payments/
│   │   ├── x402Client.ts   # Thin wrapper over x402 SDK
│   │   └── receipt.ts      # Receipt & logging
│   │
│   ├── threats/
│   │   ├── infiniteRetry.ts
│   │   ├── overpricing.ts
│   │   └── fakeService.ts
│   │
│   └── utils/
│       ├── logger.ts
│       └── errors.ts
│
├── demo/
│   ├── naive-agent.ts
│   ├── guarded-agent.ts
│   ├── malicious-api.ts
│   └── README.md
│
├── test/
│   ├── policy.test.ts
│   ├── budget.test.ts
│   └── guard.test.ts
│
└── docs/
    ├── threat-model.md
    └── architecture.md
```