import assert from 'node:assert/strict';
import * as net from 'node:net';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { configureRequestBodyParsers } from '../src/http/body-parser';

function isConnectionResetError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const value = error as Record<string, unknown>;
  return value.code === 'ECONNRESET';
}

async function sendRawChunkedJson(port: number, path: string, body: string): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      const requestHeader = [
        `POST ${path} HTTP/1.1`,
        'Host: 127.0.0.1',
        'Content-Type: application/json',
        'Transfer-Encoding: chunked',
        'Connection: close',
        '',
        '',
      ].join('\r\n');
      const first = body.slice(0, Math.floor(body.length / 2));
      const second = body.slice(Math.floor(body.length / 2));
      socket.write(requestHeader);
      socket.write(`${Buffer.byteLength(first).toString(16)}\r\n${first}\r\n`);
      socket.write(`${Buffer.byteLength(second).toString(16)}\r\n${second}\r\n`);
      socket.write('0\r\n\r\n');
    });

    let responseBuffer = '';
    socket.on('data', (chunk) => {
      responseBuffer += chunk.toString('utf8');
    });
    socket.on('end', () => {
      const statusLine = responseBuffer.split('\r\n')[0] ?? '';
      const statusCodeText = statusLine.split(' ')[1] ?? '';
      resolve(Number.parseInt(statusCodeText, 10));
    });
    socket.on('error', (error: unknown) => {
      if (isConnectionResetError(error)) {
        resolve(0);
        return;
      }
      reject(error);
    });
  });
}

async function sendRawSpoofedLengthJson(
  port: number,
  path: string,
  body: string,
  spoofedContentLength: number,
): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      const requestHeader = [
        `POST ${path} HTTP/1.1`,
        'Host: 127.0.0.1',
        'Content-Type: application/json',
        `Content-Length: ${spoofedContentLength}`,
        'Connection: close',
        '',
        '',
      ].join('\r\n');
      socket.write(requestHeader);
      socket.write(body);
      socket.end();
    });

    let responseBuffer = '';
    socket.on('data', (chunk) => {
      responseBuffer += chunk.toString('utf8');
    });
    socket.on('end', () => {
      const statusLine = responseBuffer.split('\r\n')[0] ?? '';
      const statusCodeText = statusLine.split(' ')[1] ?? '';
      resolve(Number.parseInt(statusCodeText, 10));
    });
    socket.on('error', (error: unknown) => {
      if (isConnectionResetError(error)) {
        resolve(0);
        return;
      }
      reject(error);
    });
  });
}

test('webhook json parser enforces 256KiB limit before controller logic', async () => {
  const app = express();
  configureRequestBodyParsers(app);
  app.post('/webhooks/zalo', (_req, res) => {
    res.status(202).json({ accepted: true });
  });
  app.post('/admin/sample', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const largePayload = JSON.stringify({
      event_name: 'message.text.received',
      payload: 'x'.repeat(300 * 1024),
    });

    const chunkedStatus = await sendRawChunkedJson(port, '/webhooks/zalo', largePayload);
    assert.equal(chunkedStatus, 413);

    const spoofedStatus = await sendRawSpoofedLengthJson(port, '/webhooks/zalo', largePayload, 10);
    assert.notEqual(spoofedStatus, 202);

    await request(app)
      .post('/admin/sample')
      .set('content-type', 'application/json')
      .send({
        payload: 'x'.repeat(300 * 1024),
      })
      .expect(200);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
