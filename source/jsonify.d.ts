import type {JsonPrimitive, JsonValue} from './basic';
import type {EmptyObject} from './empty-object';
import type {Merge} from './merge';
import type {NegativeInfinity, PositiveInfinity} from './numeric';
import type {TypedArray} from './typed-array';

// Note: The return value has to be `any` and not `unknown` so it can match `void`.
type NotJsonable = ((...args: any[]) => any) | undefined | symbol;

// Returns never if the key or property is not jsonable without testing whether the property is required or optional otherwise return the key.
type BaseKeyFilter<Type, Key extends keyof Type> = Key extends symbol
	? never
	: Type[Key] extends symbol
		? never
		: [(...args: any[]) => any] extends [Type[Key]]
			? never
			: Key;

// Returns never if the key or property is not jsonable or optional otherwise return the key.
type RequiredKeyFilter<Type, Key extends keyof Type> = undefined extends Type[Key]
	? never
	: BaseKeyFilter<Type, Key>;

// Returns never if the key or property is not jsonable or required otherwise return the key.
type OptionalKeyFilter<Type, Key extends keyof Type> = undefined extends Type[Key]
	? Type[Key] extends undefined
		? never
		: BaseKeyFilter<Type, Key>
	: never;

/**
Transform a type to one that is assignable to the `JsonValue` type.

This includes:
1. Transforming JSON `interface` to a `type` that is assignable to `JsonValue`.
2. Transforming non-JSON value that is *jsonable* to a type that is assignable to `JsonValue`, where *jsonable* means the non-JSON value implements the `.toJSON()` method that returns a value that is assignable to `JsonValue`.

@remarks

An interface cannot be structurally compared to `JsonValue` because an interface can be re-opened to add properties that may not be satisfy `JsonValue`.

@example
```
import type {Jsonify} from 'type-fest';

interface Geometry {
	type: 'Point' | 'Polygon';
	coordinates: [number, number];
}

const point: Geometry = {
	type: 'Point',
	coordinates: [1, 1]
};

const problemFn = (data: JsonValue) => {
	// Does something with data
};

problemFn(point); // Error: type Geometry is not assignable to parameter of type JsonValue because it is an interface

const fixedFn = <T>(data: Jsonify<T>) => {
	// Does something with data
};

fixedFn(point); // Good: point is assignable. Jsonify<T> transforms Geometry into value assignable to JsonValue
fixedFn(new Date()); // Error: As expected, Date is not assignable. Jsonify<T> cannot transforms Date into value assignable to JsonValue
```

Non-JSON values such as `Date` implement `.toJSON()`, so they can be transformed to a value assignable to `JsonValue`:

@example
```
import type {Jsonify} from 'type-fest';

const time = {
	timeValue: new Date()
};

// `Jsonify<typeof time>` is equivalent to `{timeValue: string}`
const timeJson = JSON.parse(JSON.stringify(time)) as Jsonify<typeof time>;
```

@link https://github.com/Microsoft/TypeScript/issues/1897#issuecomment-710744173

@category JSON
*/
export type Jsonify<T> =
	// Check if there are any non-JSONable types represented in the union.
	// Note: The use of tuples in this first condition side-steps distributive conditional types
	// (see https://github.com/microsoft/TypeScript/issues/29368#issuecomment-453529532)
	[Extract<T, NotJsonable | bigint>] extends [never]
		? T extends PositiveInfinity | NegativeInfinity	? null
			: T extends JsonPrimitive ? T // Primitive is acceptable
				: T extends object
				// Any object with toJSON is special case
					? T extends {toJSON(): infer J} ? (() => J) extends (() => JsonValue) // Is J assignable to JsonValue?
						? J // Then T is Jsonable and its Jsonable value is J
						: Jsonify<J> // Maybe if we look a level deeper we'll find a JsonValue
					// Instanced primitives are objects
						: T extends Number ? number
							: T extends String ? string
								: T extends Boolean ? boolean
									: T extends Map<any, any> | Set<any> ? EmptyObject
										: T extends TypedArray ? Record<string, number>
											: T extends any[]
												? {[I in keyof T]: T[I] extends NotJsonable ? null : Jsonify<T[I]>}
												: Merge<
												{[Key in keyof T as RequiredKeyFilter<T, Key>]: Jsonify<T[Key]>},
												{[Key in keyof T as OptionalKeyFilter<T, Key>]?: Jsonify<Exclude<T[Key], undefined>>}
												> // Recursive call for its children
					: never // Otherwise any other non-object is removed
		: never; // Otherwise non-JSONable type union was found not empty
