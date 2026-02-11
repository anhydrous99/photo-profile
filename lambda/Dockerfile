FROM public.ecr.aws/lambda/nodejs:20-arm64

COPY package.json ${LAMBDA_TASK_ROOT}/

RUN npm install --omit=dev

COPY handler.js ${LAMBDA_TASK_ROOT}/

CMD ["handler.handler"]
