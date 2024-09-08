import { Request, Response, Router } from "express";
import { connection } from "../../index";
import { v4 as uuidv4 } from 'uuid';
import { OkPacket } from "mysql2";
import {
  enhanceProductsComments,
  enhanceProductsImages,
  getProductsFilterQuery,
  validateAddSimilarProductsBody, validateRemoveSimilarProductsBody
} from "../helpers";
import {
  AddSimilarProductsPayload,
  ICommentEntity,
  ImagesRemovePayload,
  IProductEntity,
  IProductImageEntity,
  IProductSearchFilter, ISimilarProductEntity,
  ProductAddImagesPayload,
  ProductCreatePayload
} from "../../types";
import { mapCommentsEntity, mapImagesEntity, mapProductsEntity } from "../services/mapping";
import {
  DELETE_IMAGES_QUERY, DELETE_SIMILAR_PRODUCTS,
  INSERT_PRODUCT_IMAGES_QUERY,
  INSERT_PRODUCT_QUERY,
  REPLACE_PRODUCT_THUMBNAIL,
  UPDATE_PRODUCT_FIELDS
} from "../services/queries";
import { body, param, validationResult } from "express-validator";
import { IProduct } from "@Shared/types";

export const productsRouter = Router();

const throwServerError = (res: Response, e: Error) => {
  console.debug(e.message);
  res.status(500);
  res.send("Something went wrong");
}

productsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const [productRows] = await connection.query<IProductEntity[]>("SELECT * FROM products");
    const [commentRows] = await connection.query<ICommentEntity[]>("SELECT * FROM comments");
    const [imageRows] = await connection.query<IProductImageEntity[]>("SELECT * FROM images");

    const products = mapProductsEntity(productRows);
    const withComments = enhanceProductsComments(products, commentRows);
    const withImages = enhanceProductsImages(withComments, imageRows)

    res.send(withImages);
  } catch (e) {
    throwServerError(res, e);
  }
});

productsRouter.get('/search', async (
  req: Request<{}, {}, {}, IProductSearchFilter>,
  res: Response
) => {
  try {
    if (!Object.keys(req.query).length) {
      res.status(400);
      res.send("Filter is empty");
      return;
    }

    const [query, values] = getProductsFilterQuery(req.query);
    const [rows] = await connection.query<IProductEntity[]>(query, values);

    if (!rows?.length) {
      res.send([]);
      return;
    }

    const [commentRows] = await connection.query<ICommentEntity[]>("SELECT * FROM comments");
    const [imageRows] = await connection.query<IProductImageEntity[]>("SELECT * FROM images");

    const products = mapProductsEntity(rows);
    const withComments = enhanceProductsComments(products, commentRows);
    const withImages = enhanceProductsImages(withComments, imageRows)

    res.send(withImages);
  } catch (e) {
    throwServerError(res, e);
  }
});

productsRouter.get('/:id', async (
  req: Request<{ id: string }>,
  res: Response
) => {
  try {
    const [rows] = await connection.query<IProductEntity[]>(
      "SELECT * FROM products WHERE product_id = ?",
      [req.params.id]
    );

    if (!rows?.[0]) {
      res.status(404);
      res.send(`Product with id ${req.params.id} is not found`);
      return;
    }

    const [comments] = await connection.query<ICommentEntity[]>(
      "SELECT * FROM comments WHERE product_id = ?",
      [req.params.id]
    );

    const [images] = await connection.query<IProductImageEntity[]>(
      "SELECT * FROM images WHERE product_id = ?",
      [req.params.id]
    );

    const product = mapProductsEntity(rows)[0];

    if (comments.length) {
      product.comments = mapCommentsEntity(comments);
    }

    if (images.length) {
      product.images = mapImagesEntity(images);
      product.thumbnail = product.images.find(image => image.main) || product.images[0];
    }

    res.send(product);
  } catch (e) {
    throwServerError(res, e);
  }
});

productsRouter.post('/', async (
  req: Request<{}, {}, ProductCreatePayload>,
  res: Response
) => {
  try {
    const { title, description, price, images } = req.body;
    const productId = uuidv4();
    await connection.query<OkPacket>(
      INSERT_PRODUCT_QUERY,
      [productId, title || null, description || null, price || null]
    );

    if (images) {
      const values = images.map((image) => [uuidv4(), image.url, productId, image.main]);
      await connection.query<OkPacket>(INSERT_PRODUCT_IMAGES_QUERY, [values]);
    }

    const [rows] = await connection.query<IProductEntity[]>(
      "SELECT * FROM products WHERE product_id = ?",
      [productId]
    );

    const product = mapProductsEntity(rows)[0];

    res.status(201);
    res.send(product);
  } catch (e) {
    throwServerError(res, e);
  }
});

productsRouter.delete('/:id', async (
  req: Request<{ id: string }>,
  res: Response
) => {
  try {
    const [rows] = await connection.query<IProductEntity[]>(
      "SELECT * FROM products WHERE product_id = ?",
      [req.params.id]
    );

    if (!rows?.[0]) {
      res.status(404);
      res.send(`Product with id ${req.params.id} is not found`);
      return;
    }

    await connection.query<OkPacket>(
      "DELETE FROM images WHERE product_id = ?",
      [req.params.id]
    );

    await connection.query<OkPacket>(
      "DELETE FROM comments WHERE product_id = ?",
      [req.params.id]
    );

    await connection.query<OkPacket>(
      "DELETE FROM similar_products WHERE first_product = ? OR second_product = ?",
      [req.params.id, req.params.id]
    );

    await connection.query<OkPacket>(
      "DELETE FROM products WHERE product_id = ?",
      [req.params.id]
    );

    res.status(200);
    res.end();
  } catch (e) {
    throwServerError(res, e);
  }
});

productsRouter.post('/add-images', async (
  req: Request<{}, {}, ProductAddImagesPayload>,
  res: Response
) => {
  try {
    const { productId, images } = req.body;

    if (!images?.length) {
      res.status(400);
      res.send("Images array is empty");
      return;
    }

    const values = images.map((image) => [uuidv4(), image.url, productId, image.main]);
    await connection.query<OkPacket>(INSERT_PRODUCT_IMAGES_QUERY, [values]);

    res.status(201);
    res.send(`Images for a product id:${productId} have been added!`);
  } catch (e) {
    throwServerError(res, e);
  }
});

productsRouter.patch('/:id', async (
  req: Request<{ id: string }, {}, ProductCreatePayload>,
  res: Response
) => {
  try {
    const { id } = req.params;

    const [rows] = await connection.query<IProductEntity[]>(
      "SELECT * FROM products WHERE product_id = ?",
      [id]
    );

    if (!rows?.[0]) {
      res.status(404);
      res.send(`Product with id ${id} is not found`);
      return;
    }

    const currentProduct = rows[0];

    await connection.query<OkPacket>(
      UPDATE_PRODUCT_FIELDS,
      [
        req.body.hasOwnProperty("title") ? req.body.title : currentProduct.title,
        req.body.hasOwnProperty("description") ? req.body.description : currentProduct.description,
        req.body.hasOwnProperty("price") ? req.body.price : currentProduct.price,
        id
      ]
    );

    res.status(200);
    res.send(`Product id:${id} has been added!`);
  } catch (e) {
    throwServerError(res, e);
  }
});

productsRouter.get(
  '/similar/:id',
  [
    param('id').isUUID().withMessage('Product id is not UUID')
  ],
  async (
    req: Request<{ id: string }>,
    res: Response
  ) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const originProduct = req.params.id;

      const [rows] = await connection.query<ISimilarProductEntity[]>(
        "SELECT * FROM similar_products WHERE first_product = ? OR second_product = ?",
        [originProduct, originProduct]
      );

      if (!rows?.length) {
        return res.send([]);
      }

      const similarProductsIds = rows.map(({ first_product, second_product }) => {
        return first_product === originProduct ? second_product : first_product;
      });

      const [similarProducts] = await connection.query<IProductEntity[]>(
        "SELECT * FROM products WHERE product_id IN (?)",
        [similarProductsIds]
      );

      const productsList: IProduct[] = similarProducts.map(({product_id, ...rest}) => {
        return {
          id: product_id,
          ...rest
        }
      });

      res.send(productsList);
    } catch (e) {
      throwServerError(res, e);
    }
  });

productsRouter.post(
  '/add-similar',
  [
    body().custom(validateAddSimilarProductsBody)
  ],
  async (
    req: Request<{}, {}, AddSimilarProductsPayload>,
    res: Response
  ) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      await connection.query<OkPacket>(
        "INSERT INTO similar_products (first_product, second_product) VALUES ?",
        [req.body]
      );

      res.status(201).send();
    } catch (e) {
      throwServerError(res, e);
    }
  });

productsRouter.post(
  '/remove-similar',
  [
    body().custom(validateRemoveSimilarProductsBody)
  ],
  async (
    req: Request<{}, {}, string[]>,
    res: Response
  ) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const [info] = await connection.query<OkPacket>(
        DELETE_SIMILAR_PRODUCTS,
        [req.body, req.body]
      );

      res.send(`${info.affectedRows} rows have been removed`);
    } catch (e) {
      throwServerError(res, e);
    }
  });

