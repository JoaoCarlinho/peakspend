-- CreateIndex
CREATE INDEX "expenses_userId_date_idx" ON "expenses"("userId", "date");

-- CreateIndex
CREATE INDEX "ml_models_userId_trainingDate_idx" ON "ml_models"("userId", "trainingDate");

-- CreateIndex
CREATE INDEX "training_data_userId_timestamp_idx" ON "training_data"("userId", "timestamp");
