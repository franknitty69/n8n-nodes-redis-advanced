import type {
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	IDataObject,
	IExecuteFunctions,
	INodeCredentialTestResult,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { createClient } from 'redis';

import type { RedisCredential, RedisClient } from './types';

export function setupRedisClient(credentials: RedisCredential): RedisClient {
	const socketConfig: any = {
		host: credentials.host,
		port: credentials.port,
	};

	if (credentials.ssl === true) {
		socketConfig.tls = true;
	}

	return createClient({
		socket: socketConfig,
		database: credentials.database,
		username: credentials.user || undefined,
		password: credentials.password || undefined,
	});
}

export async function redisConnectionTest(
	this: ICredentialTestFunctions,
	credential: ICredentialsDecrypted,
): Promise<INodeCredentialTestResult> {
	const credentials = credential.data as RedisCredential;

	try {
		const client = setupRedisClient(credentials);
		await client.connect();
		await client.ping();
		return {
			status: 'OK',
			message: 'Connection successful!',
		};
	} catch (error) {
		return {
			status: 'Error',
			message: error.message,
		};
	}
}

/** Parses the given value in a number if it is one else returns a string */
function getParsedValue(value: string): string | number {
	if (value.match(/^[\d\.]+$/) === null) {
		// Is a string
		return value;
	} else {
		// Is a number
		return parseFloat(value);
	}
}

/** Converts the Redis Info String into an object */
export function convertInfoToObject(stringData: string): IDataObject {
	const returnData: IDataObject = {};

	let key: string, value: string;
	for (const line of stringData.split('\n')) {
		if (['#', ''].includes(line.charAt(0))) {
			continue;
		}
		[key, value] = line.split(':');
		if (key === undefined || value === undefined) {
			continue;
		}
		value = value.trim();

		if (value.includes('=')) {
			returnData[key] = {};
			let key2: string, value2: string;
			for (const keyValuePair of value.split(',')) {
				[key2, value2] = keyValuePair.split('=');
				(returnData[key] as IDataObject)[key2] = getParsedValue(value2);
			}
		} else {
			returnData[key] = getParsedValue(value);
		}
	}

	return returnData;
}

export async function getValue(client: RedisClient, keyName: string, type?: string) {
	if (type === undefined || type === 'automatic') {
		// Request the type first
		type = await client.type(keyName);
	}

	if (type === 'string') {
		return await client.get(keyName);
	} else if (type === 'hash') {
		return await client.hGetAll(keyName);
	} else if (type === 'list') {
		return await client.lRange(keyName, 0, -1);
	} else if (type === 'sets') {
		return await client.sMembers(keyName);
	}

	return undefined;
}

export async function setValue(
	this: IExecuteFunctions,
	client: RedisClient,
	keyName: string,
	value: string | number | object | string[] | number[],
	expire: boolean,
	ttl: number,
	type?: string,
	valueIsJSON?: boolean,
	setMode?: 'always' | 'nx' | 'xx',
) {
	if (type === undefined || type === 'automatic') {
		// Request the type first
		if (typeof value === 'string') {
			type = 'string';
		} else if (Array.isArray(value)) {
			type = 'list';
		} else if (typeof value === 'object') {
			type = 'hash';
		} else {
			throw new NodeOperationError(
				this.getNode(),
				'Could not identify the type to set. Please set it manually!',
			);
		}
	}

	if (type === 'string') {
		const setOptions: any = {};

		// Add expiration if specified
		if (expire && ttl > 0) {
			setOptions.EX = ttl;
		}

		// Add conditional flags if specified
		if (setMode === 'nx') {
			setOptions.NX = true;
		} else if (setMode === 'xx') {
			setOptions.XX = true;
		}

		// Use SET with options if any are specified, otherwise use basic SET
		if (Object.keys(setOptions).length > 0) {
			const result = await client.set(keyName, value.toString(), setOptions);
			// Redis returns null for NX/XX when condition is not met - this is normal behavior
			if (result === null && (setMode === 'nx' || setMode === 'xx')) {
				return {
					success: false,
					operation: `SET ${setMode.toUpperCase()}`,
					key: keyName,
					reason: setMode === 'nx' ? 'key_already_exists' : 'key_does_not_exist',
					message: `SET ${setMode.toUpperCase()} condition not met: key "${keyName}" ${setMode === 'nx' ? 'already exists' : 'does not exist'}`
				};
			}
		} else {
			await client.set(keyName, value.toString());
		}
	} else if (type === 'hash') {
		if (valueIsJSON) {
			let values: unknown;
			if (typeof value === 'string') {
				try {
					values = JSON.parse(value);
				} catch {
					// This is how we originally worked and prevents a breaking change
					values = value;
				}
			} else {
				values = value;
			}
			for (const key of Object.keys(values as object)) {
				await client.hSet(keyName, key, (values as IDataObject)[key]!.toString());
			}
		} else {
			const values = value.toString().split(' ');
			await client.hSet(keyName, values);
		}
	} else if (type === 'list') {
		for (let index = 0; index < (value as string[]).length; index++) {
			await client.lSet(keyName, index, (value as IDataObject)[index]!.toString());
		}
	} else if (type === 'sets') {
		//@ts-ignore
		await client.sAdd(keyName, value);
	}

	// Handle expiration for non-string types (hash, list, sets)
	if (expire && ttl > 0 && type !== 'string') {
		await client.expire(keyName, ttl);
	}
	
	// Return success result for normal operations
	return {
		success: true,
		operation: setMode ? `SET ${setMode.toUpperCase()}` : 'SET',
		key: keyName
	};
}
