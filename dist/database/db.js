"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDatabase = exports.AppDataSource = void 0;
const typeorm_1 = require("typeorm");
const config_1 = require("../config");
const User_entity_1 = require("../entities/User.entity");
exports.AppDataSource = new typeorm_1.DataSource({
    type: "mysql",
    host: config_1.config.database.host,
    port: config_1.config.database.port,
    username: config_1.config.database.username,
    password: config_1.config.database.password,
    database: config_1.config.database.database,
    synchronize: config_1.config.server.nodeEnv === "development",
    logging: config_1.config.server.nodeEnv === "development",
    entities: [User_entity_1.User],
    migrations: [],
    subscribers: [],
});
const connectDatabase = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield exports.AppDataSource.initialize();
        console.log("✅ Database connected successfully");
    }
    catch (error) {
        console.error("❌ Database connection failed:", error);
        process.exit(1);
    }
});
exports.connectDatabase = connectDatabase;
