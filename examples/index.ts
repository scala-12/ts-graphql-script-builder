import { SchemaBuilder } from "../src";

enum PublisherField {
    NAME = 'name',
    ADDRESS = 'address',
}

class PublisherSchemaBuilder extends SchemaBuilder<PublisherField> {
    constructor(entryName?: string | null | undefined, ...initFields: PublisherField[]) {
        super(PublisherField, entryName, initFields);
    }
}

enum BookField {
    TITLE = 'title',
    PUBLISHER = 'publisher',
}

class BookSchemaBuilder extends SchemaBuilder<BookField> {
    constructor(entryName?: string | null | undefined, ...initFields: BookField[]) {
        super(
            BookField,
            entryName,
            initFields,
            [BookField.PUBLISHER, (e) => new PublisherSchemaBuilder(e)]);
    }
}

enum AuthorField {
    ID = 'id',
    NAME = 'name',
    BOOKS = 'books',
}

class AuthorSchemaBuilder extends SchemaBuilder<AuthorField> {
    constructor(entryName?: string | null | undefined, ...initFields: AuthorField[]) {
        super(
            AuthorField,
            entryName,
            initFields,
            [AuthorField.BOOKS, (e) => new BookSchemaBuilder(e)]
        );
    }
}

/**
 * This code returns only simple, non-composite schema fields:
 * 
 * author {
 *  id
 *  name
 * }
*/
const authorDefault = new AuthorSchemaBuilder('author').build();

/**
 * This code returns schema with book publishers info with simple fields:
 * 
 * author {
 *  book {
 *   publishers {
 *    name
 *    address
 *   }
 *  }
 * }
*/
const authorWithPublishers = (builder =>
    builder.addComplex(
        builder.getComplex<BookSchemaBuilder>(AuthorField.BOOKS)?.set(BookField.PUBLISHER)
    )
)(new AuthorSchemaBuilder('author').clear()).build();

/**
 * This code returns builder with schema with simple fields and nested simple fields:
 * 
 * {
 *  id
 *  name
 *  book {
 *   title
 *  }
 * }
*/
const authorWithSimpleTree = new AuthorSchemaBuilder().add(...Object.values(AuthorField));

/**
 * This code returns query script
 */
const queryScript = SchemaBuilder.createScript("query", 'getAuthor', authorWithSimpleTree);
