import EventEmitter from 'eventemitter3';
import { Bounds } from '../../../../scene/container/bounds/Bounds';
import { uid } from '../../../../utils/data/uid';
import { ensureIsBuffer } from './utils/ensureIsBuffer';
import { getGeometryBounds } from './utils/getGeometryBounds';

import type { Buffer, TypedArray } from '../buffer/Buffer';
import type { Topology, VertexFormat } from './const';

export type IndexBufferArray = Uint16Array | Uint32Array;

/**
 * The attribute data for a geometries attributes
 * @memberof rendering
 */
export interface Attribute
{
    /** the buffer that this attributes data belongs to */
    buffer: Buffer;
    /** the format of the attribute */
    format: VertexFormat;
    /** set where the shader location is for this attribute */
    shaderLocation: number; // TODO - auto assign this move this?? introspection??
    /** the stride of the data in the buffer*/
    stride?: number;
    /** the offset of the attribute from the buffer, defaults to 0 */
    offset?: number;
    /** is this an instanced buffer? (defaults to false) */
    instance?: boolean;
    /**  The number of elements to be rendered. If not specified, all vertices after the starting vertex will be drawn. */
    size?: number;
    /** the type of attribute  */
    type?: number;
    /**
     * The starting vertex in the geometry to start drawing from. If not specified,
     *  drawing will start from the first vertex.
     */
    start?: number;
}

/**
 * The attribute options used by the constructor for adding geometries attributes
 * extends {@link rendering.Attribute} but allows for the buffer to be a typed or number array
 * @memberof rendering
 */
type AttributesOption = Omit<Attribute, 'buffer'> & { buffer: Buffer | TypedArray | number[]};

/**
 * the interface that describes the structure of the geometry
 * @memberof rendering
 */
export interface GeometryDescriptor
{
    /** an optional label to easily identify the geometry */
    label?: string;
    /** the attributes that make up the geometry */
    attributes: Record<string, AttributesOption>;
    /** optional index buffer for this geometry */
    indexBuffer?: Buffer | TypedArray | number[];
    /** the topology of the geometry, defaults to 'triangle-list' */
    topology?: Topology;
}

/**
 * A Geometry is a low-level object that represents the structure of 2D shapes in terms of vertices and attributes.
 * It's a crucial component for rendering as it describes the shape and format of the data that will go through the shaders.
 * Essentially, a Geometry object holds the data you'd send to a GPU buffer.
 *
 * A geometry is basically made of two components:
 * <br>
 * <b>Attributes</b>: These are essentially arrays that define properties of the vertices like position, color,
 * texture coordinates, etc. They map directly to attributes in your vertex shaders.
 * <br>
 * <b>Indices</b>: An optional array that describes how the vertices are connected.
 * If not provided, vertices will be interpreted in the sequence they're given.
 * @example
 *
 * const geometry = new Geometry({
 *   attributes: {
 *     aPosition: [ // add some positions
 *       0, 0,
 *       0, 100,
 *       100, 100,
 *       100,   0,
 *     ],
 *     aUv: [ // add some uvs
 *       0, 0,
 *       0, 1,
 *       1, 1,
 *       1, 0,
 *     ]
 *   }
 * });
 * @memberof rendering
 * @class
 */
export class Geometry extends EventEmitter<{
    update: Geometry,
    destroy: Geometry,
}>
{
    /** The topology of the geometry. */
    public topology: Topology;
    /** The unique id of the geometry. */
    public readonly uid: number = uid('geometry');
    /** A record of the attributes of the geometry. */
    public readonly attributes: Record<string, Attribute>;
    /** The buffers that the attributes use */
    public readonly buffers: Buffer[];
    /** The index buffer of the geometry */
    public readonly indexBuffer: Buffer;

    /**
     * the layout key will be generated by WebGPU all geometries that have the same structure
     * will have the same layout key. This is used to cache the pipeline layout
     * @internal
     * @ignore
     */
    public _layoutKey = 0;

    /** true if the geometry is instanced */
    public instanced: boolean;
    /** the instance count of the geometry to draw */
    public instanceCount: number;

    private readonly _bounds: Bounds = new Bounds();
    private _boundsDirty = true;

    /**
     * Create a new instance of a geometry
     * @param options - The options for the geometry.
     */
    constructor(options: GeometryDescriptor)
    {
        const { attributes, indexBuffer, topology } = options;

        super();

        this.attributes = attributes as Record<string, Attribute>;
        this.buffers = [];

        for (const i in attributes)
        {
            const attribute = attributes[i];

            attribute.buffer = ensureIsBuffer(attribute.buffer, false);

            const bufferIndex = this.buffers.indexOf(attribute.buffer);

            if (bufferIndex === -1)
            {
                this.buffers.push(attribute.buffer);

                attribute.buffer.on('update', this.onBufferUpdate, this);
            }
        }

        if (indexBuffer)
        {
            this.indexBuffer = ensureIsBuffer(indexBuffer, true);

            this.buffers.push(this.indexBuffer);
        }

        this.topology = topology || 'triangle-list';
    }

    protected onBufferUpdate(): void
    {
        this._boundsDirty = true;
        this.emit('update', this);
    }

    /**
     * Returns the requested attribute.
     * @param id - The name of the attribute required
     * @returns - The attribute requested.
     */
    public getAttribute(id: string): Attribute
    {
        return this.attributes[id];
    }

    /**
     * Returns the index buffer
     * @returns - The index buffer.
     */
    public getIndex(): Buffer
    {
        return this.indexBuffer;
    }

    /**
     * Returns the requested buffer.
     * @param id - The name of the buffer required.
     * @returns - The buffer requested.
     */
    public getBuffer(id: string): Buffer
    {
        return this.getAttribute(id).buffer;
    }

    /**
     * Used to figure out how many vertices there are in this geometry
     * @returns the number of vertices in the geometry
     */
    public getSize(): number
    {
        for (const i in this.attributes)
        {
            const attribute = this.attributes[i];
            const buffer = this.getBuffer(i);

            // TODO use SIZE again like v7..
            return (buffer.data as any).length / ((attribute.stride / 4) || attribute.size);
        }

        return 0;
    }

    /** Returns the bounds of the geometry. */
    get bounds(): Bounds
    {
        if (!this._boundsDirty) return this._bounds;

        this._boundsDirty = false;

        return getGeometryBounds(this, 'aPosition', this._bounds);
    }

    /**
     * destroys the geometry.
     * @param destroyBuffers - destroy the buffers associated with this geometry
     */
    public destroy(destroyBuffers = false): void
    {
        this.emit('destroy', this);

        this.removeAllListeners();

        if (destroyBuffers)
        {
            this.buffers.forEach((buffer) => buffer.destroy());
        }

        (this.attributes as null) = null;
        (this.buffers as null) = null;
        (this.indexBuffer as null) = null;
        (this._bounds as null) = null;
    }
}

