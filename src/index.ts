type BuilderInit = (name: string) => SchemaBuilder<string>;

const camelToSnakeCase = (text: string, toUpper = false) => {
    const result = text.split(/(?=[A-Z])/).join('_');

    return toUpper ? result.toUpperCase() : result.toLowerCase();
}

/** Abstract class for creating a schema. The entry must have only string keys */
export abstract class SchemaBuilder<EntryField extends string> {

    /** Set of simple fields used to build schema */
    protected _simple: Set<EntryField>;

    /** Map[name, subfields] of complex fields used to build schema */
    protected _complex: Map<EntryField, string>;

    /** Set of available simple field names that exist in the source schema */
    private _originSimple?: ReadonlySet<string>;

    /** Map[name, info] of available complex fields that exist in the source schema */
    private _originComplex?: ReadonlyMap<string, BuilderInit>;

    /** 
     * By default, creates a schema using only simple fields
     * @param simpleFields Array of available simple keys or Enum with field names. May include complex keys if complex keys are specified.
     * @param name schema entity name used in scripts
     * @param infoAboutComplex An array containing information about a complex field as Array[fieldName, fieldConstructor]
     */
    protected constructor(
        simpleFields: EntryField[] | { [k: string]: string },
        readonly name: string | null | undefined = '',
        initFields?: EntryField[] | null | undefined,
        ...infoAboutComplex: [EntryField, BuilderInit][]
    ) {
        this._simple = new Set();
        this._complex = new Map();

        if (infoAboutComplex?.length) {
            this._originComplex = new Map(
                infoAboutComplex.map(([field, builderInit]) => [field as string, builderInit]));
        }

        const fields = new Set((Array.isArray(simpleFields) ?
            simpleFields
            : Object.values(simpleFields)) as string[]);
        this._originComplex?.forEach((_, field) => {
            fields.delete(field);
        });
        this._originSimple = fields;


        if (this._originSimple?.size === 0 && this._originComplex?.size === 0) {
            throw new Error("Schema does not include fields");
        }

        if (initFields?.length) {
            this.add(...initFields);
        } else {
            this.useSimpleOnly(false);
        }
    }

    /** Remove a field from builder if it exists in the origin schema */
    remove(field: EntryField): this {
        this._complex.delete(field);
        this._simple.delete(field);

        return this;
    }

    /** Remove all fields from builder */
    clear(): this {
        this._complex = new Map();
        this._simple = new Set();

        return this;
    }

    /**
     * Add complex field for schema builder if it available.
     * If the builder exists, it will be replaced.
     * @param complex Builder of complex field with a given set of subfields
     */
    addComplex(complex: SchemaBuilder<string> | undefined | null): this {
        if (complex != null && complex.name) {
            if (this._originComplex?.has(complex.name)) {
                // TODO check types before setting
                this._complex.set(
                    complex.name as EntryField,
                    complex.build());
            }
        }

        return this;
    }

    /** 
     * Get copy of complex field without settings
     * @param field The name of the complex field that must be in the source schema
     */
    getComplex<TComplex extends SchemaBuilder<string>>(field: string) {
        const builderInit = this._originComplex?.get(field);
        if (builderInit != null) {
            return (builderInit(field) as TComplex);
        }
    }

    /**
     * Set all available simple fields for use in the schema
     * @param complexWithSimple For each complex field use simple subfields
     */
    useSimpleOnly(complexWithSimple = false): this {
        if (this._originSimple != null) {
            this._simple.clear();
            this._originSimple.forEach(
                e => this._simple.add(e as EntryField)
            );
        }
        if (this._originComplex != null) {
            this._complex.clear();
            if (complexWithSimple) {
                this._originComplex.forEach((builderInit, field) =>
                    this.addComplex(
                        builderInit(field)
                    )
                );
            }
        }

        return this;
    }

    /**
     * Add fields to schema.
     * If the field is complex, default fields will be setted.
     * @param fields added fields
     */
    add(...fields: (EntryField)[]): this {
        enum FieldType {
            COMPLEX,
            SIMPLE,
            UNDEFINED
        }
        const groupedFields = fields.reduce(
            (acc, field) => {
                let key: FieldType | undefined;
                if (this._originComplex?.has(field as string)) {
                    if (!this._complex.has(field)) {
                        key = FieldType.COMPLEX;
                    }
                } else if (this._originSimple?.has(field as string)) {
                    key = FieldType.SIMPLE;
                }
                if (key == null) {
                    key = FieldType.UNDEFINED;
                }
                acc[key].push(field);

                return acc;
            },
            {
                [FieldType.COMPLEX]: [] as (EntryField)[],
                [FieldType.SIMPLE]: [] as (EntryField)[],
                [FieldType.UNDEFINED]: [] as (EntryField)[]
            }
        );

        groupedFields[FieldType.COMPLEX].forEach(e => {
            const builderInit = this._originComplex?.get(e as string);
            if (builderInit != null) {
                this.addComplex(
                    builderInit(e as string)
                );
            }
        });

        groupedFields[FieldType.SIMPLE].forEach(e => this._simple.add(e));

        return this;
    }

    /**
     * Use only the specified fields.
     * If the field is complex, default fields will be added.
     * @param fields added fields
     */
    set(...fields: (EntryField)[]): this {
        this.clear();
        return this.add(...fields);
    }

    /**
     * Build a schema with the provided fields and with or without the schema name
     * @param addEntryName if false then dont add prefix with entry name
     * @returns GraphQL schema string with name or not
     */
    build(addEntryName = true): string {
        const simpleFields = Array.from(this._simple.values()) as string[];
        const complexFields = Array.from(this._complex.values());
        const fields = simpleFields.concat(complexFields);

        const fieldsSchema = fields.length ? `{${simpleFields.concat(complexFields).join(' ')}}` : '';

        return (addEntryName ? (this.name + ' ') : '') + fieldsSchema;
    }

    /**
     * Create name of operation based on script name
     * @param scriptName 
     */
    static createOperationName = (scriptName: string) => camelToSnakeCase(scriptName, true)

    /**
     * Create script as query or mutation
     * @param resultSchema Used for building schema result of script. May be as builder or string
     * @param paramsMapping Mapping a schema field to a GraphQL type with ordering
     */
    static createScript(
        scriptType: 'query' | 'mutation',
        name: string,
        resultSchema?: SchemaBuilder<string> | string | undefined | null,
        ...paramsMapping: [string, string][]
    ) {
        const args = paramsMapping?.map(([fName]) => `${fName}: $${fName}`).join(', ');
        const schema = (
            args?.length
                ? `(${args})`
                : ''
        ) + (
                resultSchema != null ?
                    typeof resultSchema === 'string' ?
                        resultSchema
                        : resultSchema.build(false)
                    : null
            ) || '';

        const operationName = `${scriptType} ${SchemaBuilder.createOperationName(name)}`;

        const preparedParams = paramsMapping?.map(([fName, fType]) =>
            `$${fName}: ${fType || 'String!'}`
        ).join('\n');
        const params = preparedParams != null && preparedParams.length > 0 ?
            `(${preparedParams})`
            : '';

        return `${operationName} ${params} { ${name} ${schema} }`;
    }

}
