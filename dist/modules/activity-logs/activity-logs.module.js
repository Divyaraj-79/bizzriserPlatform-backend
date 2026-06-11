"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityLogsModule = void 0;
const common_1 = require("@nestjs/common");
const activity_logger_service_1 = require("./activity-logger.service");
const activity_logs_controller_1 = require("./activity-logs.controller");
let ActivityLogsModule = class ActivityLogsModule {
};
exports.ActivityLogsModule = ActivityLogsModule;
exports.ActivityLogsModule = ActivityLogsModule = __decorate([
    (0, common_1.Module)({
        providers: [activity_logger_service_1.ActivityLoggerService],
        controllers: [activity_logs_controller_1.ActivityLogsController],
        exports: [activity_logger_service_1.ActivityLoggerService],
    })
], ActivityLogsModule);
//# sourceMappingURL=activity-logs.module.js.map