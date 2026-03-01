/**
 * rabbitmq.ts — RabbitMQ connection manager with queue topology
 *
 * Manages amqplib connection lifecycle, channel creation, queue/exchange
 * assertion, publishing, and consuming with automatic reconnection.
 */

import amqplib, { type Channel, type ConsumeMessage } from 'amqplib';
import { config } from '../config.js';

let connection: Awaited<ReturnType<typeof amqplib.connect>> | null = null;
let channel: Channel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isShuttingDown = false;

// ── Queue names ──────────────────────────────────────────────

export const QUEUES = {
    CINEMATIFY_JOBS: 'cinematify-jobs',
    CINEMATIFY_DLQ: 'cinematify-jobs.dlq',
    PDF_EXTRACT: 'pdf-extract',
    PDF_EXTRACT_DLQ: 'pdf-extract.dlq',
} as const;

const DLX_EXCHANGE = 'infinitycn.dlx';

// ── Connection ───────────────────────────────────────────────

async function assertTopology(ch: Channel): Promise<void> {
    // Dead letter exchange
    await ch.assertExchange(DLX_EXCHANGE, 'direct', { durable: true });

    // Dead letter queues
    await ch.assertQueue(QUEUES.CINEMATIFY_DLQ, { durable: true });
    await ch.bindQueue(QUEUES.CINEMATIFY_DLQ, DLX_EXCHANGE, 'cinematify');

    await ch.assertQueue(QUEUES.PDF_EXTRACT_DLQ, { durable: true });
    await ch.bindQueue(QUEUES.PDF_EXTRACT_DLQ, DLX_EXCHANGE, 'pdf-extract');

    // Main work queues
    await ch.assertQueue(QUEUES.CINEMATIFY_JOBS, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': DLX_EXCHANGE,
            'x-dead-letter-routing-key': 'cinematify',
            'x-message-ttl': 3_600_000, // 1 hour max age
        },
    });

    await ch.assertQueue(QUEUES.PDF_EXTRACT, {
        durable: true,
        arguments: {
            'x-dead-letter-exchange': DLX_EXCHANGE,
            'x-dead-letter-routing-key': 'pdf-extract',
            'x-message-ttl': 600_000, // 10 min max age
        },
    });

    // Prefetch 1 per consumer (process one message at a time)
    await ch.prefetch(config.workerConcurrency);

    console.log('[RabbitMQ] Queue topology asserted');
}

export async function connect(): Promise<void> {
    if (isShuttingDown) return;

    try {
        connection = await amqplib.connect(config.rabbitmqUrl);
        console.log('[RabbitMQ] Connected');

        connection.on('error', err => {
            console.error('[RabbitMQ] Connection error:', err.message);
        });

        connection.on('close', () => {
            console.log('[RabbitMQ] Connection closed');
            connection = null;
            channel = null;
            scheduleReconnect();
        });

        channel = await connection.createChannel();

        channel.on('error', err => {
            console.error('[RabbitMQ] Channel error:', err.message);
        });

        channel.on('close', () => {
            console.log('[RabbitMQ] Channel closed');
            channel = null;
        });

        await assertTopology(channel);
    } catch (err) {
        console.error('[RabbitMQ] Connection failed:', (err as Error).message);
        connection = null;
        channel = null;
        scheduleReconnect();
    }
}

function scheduleReconnect(): void {
    if (isShuttingDown || reconnectTimer) return;
    const delay = 5000;
    console.log(`[RabbitMQ] Reconnecting in ${delay}ms...`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
    }, delay);
}

// ── Publishing ───────────────────────────────────────────────

export async function publishJob(queue: string, message: object): Promise<void> {
    if (!channel) throw new Error('RabbitMQ channel not available');

    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
        persistent: true,
        contentType: 'application/json',
    });
}

// ── Consuming ────────────────────────────────────────────────

export async function consumeJobs(
    queue: string,
    handler: (msg: ConsumeMessage, channel: Channel) => Promise<void>,
): Promise<string> {
    if (!channel) throw new Error('RabbitMQ channel not available');

    const ch = channel;
    const { consumerTag } = await ch.consume(queue, async msg => {
        if (!msg) return;
        try {
            await handler(msg, ch);
            ch.ack(msg);
        } catch (err) {
            console.error(`[RabbitMQ] Handler error on ${queue}:`, (err as Error).message);
            // Nack without requeue — sends to DLQ via dead letter exchange
            ch.nack(msg, false, false);
        }
    });

    console.log(`[RabbitMQ] Consuming ${queue} (tag: ${consumerTag})`);
    return consumerTag;
}

// ── Utilities ────────────────────────────────────────────────

export function getChannel(): Channel | null {
    return channel;
}

export async function isHealthy(): Promise<boolean> {
    return connection !== null && channel !== null;
}

export async function disconnect(): Promise<void> {
    isShuttingDown = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    try {
        if (channel) {
            await channel.close();
            channel = null;
        }
    } catch {
        /* already closed */
    }

    try {
        if (connection) {
            await connection.close();
            connection = null;
        }
    } catch {
        /* already closed */
    }

    console.log('[RabbitMQ] Disconnected');
}
