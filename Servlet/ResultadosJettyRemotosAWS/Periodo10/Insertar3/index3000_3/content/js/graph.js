/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 615.0, "minX": 0.0, "maxY": 22620.0, "series": [{"data": [[0.0, 615.0], [0.1, 620.0], [0.2, 646.0], [0.3, 743.0], [0.4, 758.0], [0.5, 817.0], [0.6, 829.0], [0.7, 897.0], [0.8, 909.0], [0.9, 926.0], [1.0, 941.0], [1.1, 985.0], [1.2, 1001.0], [1.3, 1037.0], [1.4, 1058.0], [1.5, 1112.0], [1.6, 1151.0], [1.7, 1240.0], [1.8, 1258.0], [1.9, 1272.0], [2.0, 1355.0], [2.1, 1395.0], [2.2, 1448.0], [2.3, 1528.0], [2.4, 1538.0], [2.5, 1565.0], [2.6, 1593.0], [2.7, 1641.0], [2.8, 1690.0], [2.9, 1847.0], [3.0, 1893.0], [3.1, 1937.0], [3.2, 2015.0], [3.3, 2069.0], [3.4, 2155.0], [3.5, 2217.0], [3.6, 2244.0], [3.7, 2281.0], [3.8, 2293.0], [3.9, 2306.0], [4.0, 2344.0], [4.1, 2378.0], [4.2, 2462.0], [4.3, 2492.0], [4.4, 2539.0], [4.5, 2573.0], [4.6, 2618.0], [4.7, 2641.0], [4.8, 2702.0], [4.9, 2743.0], [5.0, 2835.0], [5.1, 2873.0], [5.2, 2898.0], [5.3, 2915.0], [5.4, 2952.0], [5.5, 2972.0], [5.6, 3065.0], [5.7, 3082.0], [5.8, 3129.0], [5.9, 3144.0], [6.0, 3191.0], [6.1, 3242.0], [6.2, 3266.0], [6.3, 3332.0], [6.4, 3392.0], [6.5, 3415.0], [6.6, 3457.0], [6.7, 3461.0], [6.8, 3470.0], [6.9, 3480.0], [7.0, 3504.0], [7.1, 3508.0], [7.2, 3526.0], [7.3, 3565.0], [7.4, 3579.0], [7.5, 3597.0], [7.6, 3623.0], [7.7, 3644.0], [7.8, 3668.0], [7.9, 3701.0], [8.0, 3737.0], [8.1, 3744.0], [8.2, 3761.0], [8.3, 3783.0], [8.4, 3806.0], [8.5, 3837.0], [8.6, 3880.0], [8.7, 3920.0], [8.8, 3940.0], [8.9, 3980.0], [9.0, 4008.0], [9.1, 4047.0], [9.2, 4070.0], [9.3, 4090.0], [9.4, 4139.0], [9.5, 4160.0], [9.6, 4203.0], [9.7, 4238.0], [9.8, 4255.0], [9.9, 4265.0], [10.0, 4278.0], [10.1, 4302.0], [10.2, 4324.0], [10.3, 4338.0], [10.4, 4384.0], [10.5, 4433.0], [10.6, 4480.0], [10.7, 4502.0], [10.8, 4516.0], [10.9, 4539.0], [11.0, 4555.0], [11.1, 4579.0], [11.2, 4614.0], [11.3, 4641.0], [11.4, 4664.0], [11.5, 4676.0], [11.6, 4691.0], [11.7, 4706.0], [11.8, 4723.0], [11.9, 4734.0], [12.0, 4766.0], [12.1, 4791.0], [12.2, 4801.0], [12.3, 4812.0], [12.4, 4815.0], [12.5, 4826.0], [12.6, 4845.0], [12.7, 4864.0], [12.8, 4870.0], [12.9, 4878.0], [13.0, 4889.0], [13.1, 4897.0], [13.2, 4922.0], [13.3, 4929.0], [13.4, 4937.0], [13.5, 4969.0], [13.6, 4973.0], [13.7, 4983.0], [13.8, 4989.0], [13.9, 4997.0], [14.0, 5002.0], [14.1, 5006.0], [14.2, 5025.0], [14.3, 5042.0], [14.4, 5055.0], [14.5, 5061.0], [14.6, 5093.0], [14.7, 5112.0], [14.8, 5124.0], [14.9, 5131.0], [15.0, 5154.0], [15.1, 5174.0], [15.2, 5190.0], [15.3, 5200.0], [15.4, 5230.0], [15.5, 5245.0], [15.6, 5254.0], [15.7, 5260.0], [15.8, 5272.0], [15.9, 5296.0], [16.0, 5319.0], [16.1, 5349.0], [16.2, 5382.0], [16.3, 5392.0], [16.4, 5397.0], [16.5, 5412.0], [16.6, 5435.0], [16.7, 5447.0], [16.8, 5464.0], [16.9, 5480.0], [17.0, 5488.0], [17.1, 5516.0], [17.2, 5530.0], [17.3, 5542.0], [17.4, 5546.0], [17.5, 5568.0], [17.6, 5581.0], [17.7, 5583.0], [17.8, 5603.0], [17.9, 5621.0], [18.0, 5639.0], [18.1, 5655.0], [18.2, 5664.0], [18.3, 5707.0], [18.4, 5724.0], [18.5, 5745.0], [18.6, 5777.0], [18.7, 5799.0], [18.8, 5821.0], [18.9, 5828.0], [19.0, 5838.0], [19.1, 5842.0], [19.2, 5858.0], [19.3, 5868.0], [19.4, 5884.0], [19.5, 5915.0], [19.6, 5931.0], [19.7, 5965.0], [19.8, 5972.0], [19.9, 6007.0], [20.0, 6023.0], [20.1, 6040.0], [20.2, 6059.0], [20.3, 6077.0], [20.4, 6094.0], [20.5, 6119.0], [20.6, 6126.0], [20.7, 6132.0], [20.8, 6161.0], [20.9, 6204.0], [21.0, 6211.0], [21.1, 6221.0], [21.2, 6248.0], [21.3, 6259.0], [21.4, 6279.0], [21.5, 6316.0], [21.6, 6361.0], [21.7, 6373.0], [21.8, 6381.0], [21.9, 6386.0], [22.0, 6400.0], [22.1, 6421.0], [22.2, 6446.0], [22.3, 6463.0], [22.4, 6481.0], [22.5, 6506.0], [22.6, 6516.0], [22.7, 6549.0], [22.8, 6568.0], [22.9, 6572.0], [23.0, 6596.0], [23.1, 6637.0], [23.2, 6647.0], [23.3, 6657.0], [23.4, 6664.0], [23.5, 6696.0], [23.6, 6703.0], [23.7, 6733.0], [23.8, 6742.0], [23.9, 6758.0], [24.0, 6790.0], [24.1, 6799.0], [24.2, 6813.0], [24.3, 6835.0], [24.4, 6841.0], [24.5, 6847.0], [24.6, 6889.0], [24.7, 6914.0], [24.8, 6927.0], [24.9, 6929.0], [25.0, 6950.0], [25.1, 6972.0], [25.2, 6993.0], [25.3, 6998.0], [25.4, 7010.0], [25.5, 7033.0], [25.6, 7072.0], [25.7, 7089.0], [25.8, 7124.0], [25.9, 7145.0], [26.0, 7166.0], [26.1, 7184.0], [26.2, 7207.0], [26.3, 7220.0], [26.4, 7242.0], [26.5, 7266.0], [26.6, 7296.0], [26.7, 7302.0], [26.8, 7310.0], [26.9, 7403.0], [27.0, 7414.0], [27.1, 7425.0], [27.2, 7429.0], [27.3, 7434.0], [27.4, 7442.0], [27.5, 7464.0], [27.6, 7484.0], [27.7, 7503.0], [27.8, 7512.0], [27.9, 7521.0], [28.0, 7545.0], [28.1, 7577.0], [28.2, 7621.0], [28.3, 7638.0], [28.4, 7643.0], [28.5, 7671.0], [28.6, 7682.0], [28.7, 7703.0], [28.8, 7713.0], [28.9, 7741.0], [29.0, 7753.0], [29.1, 7775.0], [29.2, 7786.0], [29.3, 7811.0], [29.4, 7827.0], [29.5, 7829.0], [29.6, 7833.0], [29.7, 7834.0], [29.8, 7840.0], [29.9, 7851.0], [30.0, 7868.0], [30.1, 7892.0], [30.2, 7896.0], [30.3, 7913.0], [30.4, 7920.0], [30.5, 7939.0], [30.6, 7963.0], [30.7, 7981.0], [30.8, 7996.0], [30.9, 8014.0], [31.0, 8015.0], [31.1, 8031.0], [31.2, 8043.0], [31.3, 8052.0], [31.4, 8057.0], [31.5, 8064.0], [31.6, 8072.0], [31.7, 8092.0], [31.8, 8099.0], [31.9, 8106.0], [32.0, 8119.0], [32.1, 8127.0], [32.2, 8133.0], [32.3, 8142.0], [32.4, 8152.0], [32.5, 8166.0], [32.6, 8177.0], [32.7, 8181.0], [32.8, 8196.0], [32.9, 8220.0], [33.0, 8236.0], [33.1, 8245.0], [33.2, 8279.0], [33.3, 8290.0], [33.4, 8309.0], [33.5, 8316.0], [33.6, 8319.0], [33.7, 8326.0], [33.8, 8341.0], [33.9, 8361.0], [34.0, 8374.0], [34.1, 8386.0], [34.2, 8400.0], [34.3, 8431.0], [34.4, 8439.0], [34.5, 8468.0], [34.6, 8498.0], [34.7, 8505.0], [34.8, 8520.0], [34.9, 8530.0], [35.0, 8546.0], [35.1, 8565.0], [35.2, 8582.0], [35.3, 8594.0], [35.4, 8606.0], [35.5, 8643.0], [35.6, 8660.0], [35.7, 8681.0], [35.8, 8691.0], [35.9, 8709.0], [36.0, 8743.0], [36.1, 8750.0], [36.2, 8760.0], [36.3, 8773.0], [36.4, 8788.0], [36.5, 8796.0], [36.6, 8806.0], [36.7, 8819.0], [36.8, 8839.0], [36.9, 8843.0], [37.0, 8854.0], [37.1, 8866.0], [37.2, 8889.0], [37.3, 8936.0], [37.4, 8955.0], [37.5, 8970.0], [37.6, 8984.0], [37.7, 8991.0], [37.8, 9011.0], [37.9, 9020.0], [38.0, 9034.0], [38.1, 9056.0], [38.2, 9064.0], [38.3, 9076.0], [38.4, 9092.0], [38.5, 9100.0], [38.6, 9106.0], [38.7, 9112.0], [38.8, 9143.0], [38.9, 9156.0], [39.0, 9165.0], [39.1, 9184.0], [39.2, 9191.0], [39.3, 9202.0], [39.4, 9218.0], [39.5, 9244.0], [39.6, 9261.0], [39.7, 9268.0], [39.8, 9280.0], [39.9, 9292.0], [40.0, 9309.0], [40.1, 9322.0], [40.2, 9351.0], [40.3, 9371.0], [40.4, 9384.0], [40.5, 9392.0], [40.6, 9410.0], [40.7, 9428.0], [40.8, 9445.0], [40.9, 9480.0], [41.0, 9506.0], [41.1, 9531.0], [41.2, 9558.0], [41.3, 9576.0], [41.4, 9595.0], [41.5, 9629.0], [41.6, 9641.0], [41.7, 9680.0], [41.8, 9686.0], [41.9, 9725.0], [42.0, 9749.0], [42.1, 9755.0], [42.2, 9847.0], [42.3, 9883.0], [42.4, 9911.0], [42.5, 9949.0], [42.6, 9967.0], [42.7, 9979.0], [42.8, 10010.0], [42.9, 10065.0], [43.0, 10102.0], [43.1, 10141.0], [43.2, 10151.0], [43.3, 10170.0], [43.4, 10205.0], [43.5, 10240.0], [43.6, 10307.0], [43.7, 10346.0], [43.8, 10375.0], [43.9, 10434.0], [44.0, 10504.0], [44.1, 10553.0], [44.2, 10578.0], [44.3, 10614.0], [44.4, 10674.0], [44.5, 10688.0], [44.6, 10742.0], [44.7, 10787.0], [44.8, 10792.0], [44.9, 10810.0], [45.0, 10861.0], [45.1, 10888.0], [45.2, 10954.0], [45.3, 10976.0], [45.4, 10990.0], [45.5, 11038.0], [45.6, 11079.0], [45.7, 11095.0], [45.8, 11118.0], [45.9, 11175.0], [46.0, 11236.0], [46.1, 11270.0], [46.2, 11355.0], [46.3, 11395.0], [46.4, 11430.0], [46.5, 11471.0], [46.6, 11506.0], [46.7, 11527.0], [46.8, 11562.0], [46.9, 11596.0], [47.0, 11610.0], [47.1, 11641.0], [47.2, 11664.0], [47.3, 11685.0], [47.4, 11714.0], [47.5, 11781.0], [47.6, 11842.0], [47.7, 11903.0], [47.8, 11923.0], [47.9, 11972.0], [48.0, 11996.0], [48.1, 12054.0], [48.2, 12098.0], [48.3, 12141.0], [48.4, 12182.0], [48.5, 12208.0], [48.6, 12236.0], [48.7, 12281.0], [48.8, 12316.0], [48.9, 12366.0], [49.0, 12406.0], [49.1, 12456.0], [49.2, 12509.0], [49.3, 12532.0], [49.4, 12542.0], [49.5, 12561.0], [49.6, 12573.0], [49.7, 12590.0], [49.8, 12629.0], [49.9, 12641.0], [50.0, 12645.0], [50.1, 12649.0], [50.2, 12677.0], [50.3, 12701.0], [50.4, 12739.0], [50.5, 12779.0], [50.6, 12798.0], [50.7, 12841.0], [50.8, 12880.0], [50.9, 12888.0], [51.0, 12906.0], [51.1, 12951.0], [51.2, 12971.0], [51.3, 12999.0], [51.4, 13023.0], [51.5, 13035.0], [51.6, 13079.0], [51.7, 13143.0], [51.8, 13151.0], [51.9, 13173.0], [52.0, 13197.0], [52.1, 13223.0], [52.2, 13249.0], [52.3, 13286.0], [52.4, 13293.0], [52.5, 13323.0], [52.6, 13361.0], [52.7, 13369.0], [52.8, 13380.0], [52.9, 13419.0], [53.0, 13441.0], [53.1, 13458.0], [53.2, 13481.0], [53.3, 13493.0], [53.4, 13508.0], [53.5, 13529.0], [53.6, 13559.0], [53.7, 13587.0], [53.8, 13612.0], [53.9, 13628.0], [54.0, 13663.0], [54.1, 13676.0], [54.2, 13691.0], [54.3, 13706.0], [54.4, 13736.0], [54.5, 13752.0], [54.6, 13767.0], [54.7, 13796.0], [54.8, 13807.0], [54.9, 13883.0], [55.0, 13910.0], [55.1, 13963.0], [55.2, 13971.0], [55.3, 13982.0], [55.4, 13992.0], [55.5, 14045.0], [55.6, 14059.0], [55.7, 14086.0], [55.8, 14090.0], [55.9, 14114.0], [56.0, 14128.0], [56.1, 14148.0], [56.2, 14157.0], [56.3, 14179.0], [56.4, 14203.0], [56.5, 14216.0], [56.6, 14234.0], [56.7, 14250.0], [56.8, 14257.0], [56.9, 14269.0], [57.0, 14285.0], [57.1, 14296.0], [57.2, 14325.0], [57.3, 14340.0], [57.4, 14355.0], [57.5, 14369.0], [57.6, 14396.0], [57.7, 14422.0], [57.8, 14444.0], [57.9, 14451.0], [58.0, 14460.0], [58.1, 14483.0], [58.2, 14492.0], [58.3, 14521.0], [58.4, 14544.0], [58.5, 14559.0], [58.6, 14564.0], [58.7, 14591.0], [58.8, 14620.0], [58.9, 14635.0], [59.0, 14656.0], [59.1, 14672.0], [59.2, 14683.0], [59.3, 14695.0], [59.4, 14707.0], [59.5, 14713.0], [59.6, 14722.0], [59.7, 14733.0], [59.8, 14756.0], [59.9, 14768.0], [60.0, 14791.0], [60.1, 14796.0], [60.2, 14815.0], [60.3, 14825.0], [60.4, 14831.0], [60.5, 14846.0], [60.6, 14863.0], [60.7, 14877.0], [60.8, 14890.0], [60.9, 14892.0], [61.0, 14917.0], [61.1, 14931.0], [61.2, 14942.0], [61.3, 14960.0], [61.4, 14967.0], [61.5, 14979.0], [61.6, 14986.0], [61.7, 15008.0], [61.8, 15014.0], [61.9, 15027.0], [62.0, 15037.0], [62.1, 15046.0], [62.2, 15063.0], [62.3, 15066.0], [62.4, 15093.0], [62.5, 15117.0], [62.6, 15143.0], [62.7, 15160.0], [62.8, 15174.0], [62.9, 15199.0], [63.0, 15206.0], [63.1, 15216.0], [63.2, 15224.0], [63.3, 15238.0], [63.4, 15255.0], [63.5, 15260.0], [63.6, 15263.0], [63.7, 15287.0], [63.8, 15320.0], [63.9, 15355.0], [64.0, 15375.0], [64.1, 15422.0], [64.2, 15430.0], [64.3, 15451.0], [64.4, 15505.0], [64.5, 15518.0], [64.6, 15525.0], [64.7, 15535.0], [64.8, 15552.0], [64.9, 15558.0], [65.0, 15566.0], [65.1, 15579.0], [65.2, 15597.0], [65.3, 15622.0], [65.4, 15663.0], [65.5, 15693.0], [65.6, 15707.0], [65.7, 15714.0], [65.8, 15736.0], [65.9, 15754.0], [66.0, 15768.0], [66.1, 15782.0], [66.2, 15799.0], [66.3, 15816.0], [66.4, 15831.0], [66.5, 15857.0], [66.6, 15872.0], [66.7, 15886.0], [66.8, 15905.0], [66.9, 15919.0], [67.0, 15927.0], [67.1, 15942.0], [67.2, 15963.0], [67.3, 15976.0], [67.4, 16002.0], [67.5, 16022.0], [67.6, 16041.0], [67.7, 16076.0], [67.8, 16086.0], [67.9, 16134.0], [68.0, 16137.0], [68.1, 16150.0], [68.2, 16168.0], [68.3, 16173.0], [68.4, 16192.0], [68.5, 16229.0], [68.6, 16261.0], [68.7, 16289.0], [68.8, 16295.0], [68.9, 16315.0], [69.0, 16368.0], [69.1, 16397.0], [69.2, 16431.0], [69.3, 16441.0], [69.4, 16485.0], [69.5, 16498.0], [69.6, 16510.0], [69.7, 16537.0], [69.8, 16553.0], [69.9, 16562.0], [70.0, 16577.0], [70.1, 16589.0], [70.2, 16599.0], [70.3, 16618.0], [70.4, 16647.0], [70.5, 16672.0], [70.6, 16700.0], [70.7, 16713.0], [70.8, 16718.0], [70.9, 16721.0], [71.0, 16747.0], [71.1, 16769.0], [71.2, 16796.0], [71.3, 16820.0], [71.4, 16830.0], [71.5, 16870.0], [71.6, 16887.0], [71.7, 16891.0], [71.8, 16904.0], [71.9, 16935.0], [72.0, 16966.0], [72.1, 16985.0], [72.2, 17014.0], [72.3, 17043.0], [72.4, 17066.0], [72.5, 17073.0], [72.6, 17075.0], [72.7, 17101.0], [72.8, 17137.0], [72.9, 17152.0], [73.0, 17158.0], [73.1, 17170.0], [73.2, 17185.0], [73.3, 17187.0], [73.4, 17219.0], [73.5, 17234.0], [73.6, 17243.0], [73.7, 17266.0], [73.8, 17298.0], [73.9, 17314.0], [74.0, 17324.0], [74.1, 17336.0], [74.2, 17340.0], [74.3, 17352.0], [74.4, 17359.0], [74.5, 17367.0], [74.6, 17376.0], [74.7, 17384.0], [74.8, 17401.0], [74.9, 17417.0], [75.0, 17424.0], [75.1, 17434.0], [75.2, 17464.0], [75.3, 17472.0], [75.4, 17504.0], [75.5, 17532.0], [75.6, 17539.0], [75.7, 17550.0], [75.8, 17560.0], [75.9, 17568.0], [76.0, 17573.0], [76.1, 17585.0], [76.2, 17589.0], [76.3, 17604.0], [76.4, 17617.0], [76.5, 17628.0], [76.6, 17640.0], [76.7, 17652.0], [76.8, 17669.0], [76.9, 17713.0], [77.0, 17737.0], [77.1, 17752.0], [77.2, 17771.0], [77.3, 17801.0], [77.4, 17838.0], [77.5, 17845.0], [77.6, 17856.0], [77.7, 17858.0], [77.8, 17872.0], [77.9, 17876.0], [78.0, 17898.0], [78.1, 17911.0], [78.2, 17924.0], [78.3, 17935.0], [78.4, 17969.0], [78.5, 17979.0], [78.6, 17984.0], [78.7, 18006.0], [78.8, 18013.0], [78.9, 18036.0], [79.0, 18043.0], [79.1, 18065.0], [79.2, 18103.0], [79.3, 18112.0], [79.4, 18119.0], [79.5, 18127.0], [79.6, 18150.0], [79.7, 18172.0], [79.8, 18187.0], [79.9, 18207.0], [80.0, 18214.0], [80.1, 18244.0], [80.2, 18262.0], [80.3, 18293.0], [80.4, 18313.0], [80.5, 18319.0], [80.6, 18330.0], [80.7, 18354.0], [80.8, 18380.0], [80.9, 18402.0], [81.0, 18428.0], [81.1, 18437.0], [81.2, 18452.0], [81.3, 18470.0], [81.4, 18484.0], [81.5, 18508.0], [81.6, 18530.0], [81.7, 18533.0], [81.8, 18550.0], [81.9, 18569.0], [82.0, 18582.0], [82.1, 18591.0], [82.2, 18602.0], [82.3, 18619.0], [82.4, 18636.0], [82.5, 18661.0], [82.6, 18683.0], [82.7, 18729.0], [82.8, 18734.0], [82.9, 18753.0], [83.0, 18785.0], [83.1, 18815.0], [83.2, 18848.0], [83.3, 18853.0], [83.4, 18860.0], [83.5, 18879.0], [83.6, 18883.0], [83.7, 18962.0], [83.8, 18968.0], [83.9, 18981.0], [84.0, 18989.0], [84.1, 18994.0], [84.2, 19029.0], [84.3, 19052.0], [84.4, 19085.0], [84.5, 19105.0], [84.6, 19108.0], [84.7, 19181.0], [84.8, 19209.0], [84.9, 19233.0], [85.0, 19262.0], [85.1, 19272.0], [85.2, 19283.0], [85.3, 19302.0], [85.4, 19322.0], [85.5, 19340.0], [85.6, 19360.0], [85.7, 19373.0], [85.8, 19385.0], [85.9, 19392.0], [86.0, 19430.0], [86.1, 19461.0], [86.2, 19479.0], [86.3, 19499.0], [86.4, 19508.0], [86.5, 19535.0], [86.6, 19540.0], [86.7, 19556.0], [86.8, 19572.0], [86.9, 19591.0], [87.0, 19597.0], [87.1, 19606.0], [87.2, 19617.0], [87.3, 19626.0], [87.4, 19648.0], [87.5, 19654.0], [87.6, 19659.0], [87.7, 19674.0], [87.8, 19687.0], [87.9, 19703.0], [88.0, 19712.0], [88.1, 19717.0], [88.2, 19727.0], [88.3, 19730.0], [88.4, 19738.0], [88.5, 19753.0], [88.6, 19759.0], [88.7, 19768.0], [88.8, 19780.0], [88.9, 19792.0], [89.0, 19811.0], [89.1, 19820.0], [89.2, 19837.0], [89.3, 19864.0], [89.4, 19882.0], [89.5, 19893.0], [89.6, 19904.0], [89.7, 19936.0], [89.8, 19939.0], [89.9, 19964.0], [90.0, 19977.0], [90.1, 19984.0], [90.2, 20011.0], [90.3, 20013.0], [90.4, 20021.0], [90.5, 20036.0], [90.6, 20075.0], [90.7, 20081.0], [90.8, 20111.0], [90.9, 20145.0], [91.0, 20155.0], [91.1, 20162.0], [91.2, 20182.0], [91.3, 20214.0], [91.4, 20220.0], [91.5, 20228.0], [91.6, 20239.0], [91.7, 20245.0], [91.8, 20259.0], [91.9, 20272.0], [92.0, 20292.0], [92.1, 20305.0], [92.2, 20326.0], [92.3, 20350.0], [92.4, 20368.0], [92.5, 20386.0], [92.6, 20403.0], [92.7, 20406.0], [92.8, 20436.0], [92.9, 20448.0], [93.0, 20457.0], [93.1, 20469.0], [93.2, 20481.0], [93.3, 20488.0], [93.4, 20491.0], [93.5, 20496.0], [93.6, 20502.0], [93.7, 20507.0], [93.8, 20510.0], [93.9, 20537.0], [94.0, 20540.0], [94.1, 20542.0], [94.2, 20546.0], [94.3, 20548.0], [94.4, 20557.0], [94.5, 20565.0], [94.6, 20566.0], [94.7, 20573.0], [94.8, 20578.0], [94.9, 20584.0], [95.0, 20587.0], [95.1, 20590.0], [95.2, 20599.0], [95.3, 20610.0], [95.4, 20621.0], [95.5, 20627.0], [95.6, 20635.0], [95.7, 20638.0], [95.8, 20655.0], [95.9, 20658.0], [96.0, 20665.0], [96.1, 20681.0], [96.2, 20686.0], [96.3, 20690.0], [96.4, 20702.0], [96.5, 20706.0], [96.6, 20718.0], [96.7, 20728.0], [96.8, 20733.0], [96.9, 20741.0], [97.0, 20755.0], [97.1, 20762.0], [97.2, 20772.0], [97.3, 20779.0], [97.4, 20787.0], [97.5, 20797.0], [97.6, 20818.0], [97.7, 20831.0], [97.8, 20840.0], [97.9, 20854.0], [98.0, 20863.0], [98.1, 20877.0], [98.2, 20886.0], [98.3, 20898.0], [98.4, 20927.0], [98.5, 20972.0], [98.6, 20988.0], [98.7, 21011.0], [98.8, 21096.0], [98.9, 21107.0], [99.0, 21171.0], [99.1, 21283.0], [99.2, 21349.0], [99.3, 21452.0], [99.4, 21519.0], [99.5, 21618.0], [99.6, 21661.0], [99.7, 21785.0], [99.8, 21917.0], [99.9, 22248.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 600.0, "maxY": 50.0, "series": [{"data": [[600.0, 9.0], [700.0, 6.0], [800.0, 7.0], [900.0, 13.0], [1000.0, 7.0], [1100.0, 7.0], [1200.0, 10.0], [1300.0, 6.0], [1400.0, 2.0], [1500.0, 11.0], [1600.0, 7.0], [1700.0, 1.0], [1800.0, 5.0], [1900.0, 5.0], [2000.0, 4.0], [2100.0, 3.0], [2200.0, 12.0], [2300.0, 9.0], [2400.0, 7.0], [2500.0, 7.0], [2600.0, 6.0], [2800.0, 9.0], [2700.0, 4.0], [2900.0, 11.0], [3000.0, 5.0], [3100.0, 8.0], [3300.0, 6.0], [3200.0, 6.0], [3400.0, 17.0], [3500.0, 16.0], [3700.0, 14.0], [3600.0, 11.0], [3800.0, 8.0], [3900.0, 10.0], [4000.0, 11.0], [4100.0, 8.0], [4200.0, 15.0], [4300.0, 10.0], [4600.0, 15.0], [4400.0, 8.0], [4500.0, 14.0], [4800.0, 29.0], [4700.0, 15.0], [5000.0, 20.0], [4900.0, 26.0], [5100.0, 19.0], [5200.0, 20.0], [5300.0, 14.0], [5400.0, 18.0], [5500.0, 21.0], [5600.0, 16.0], [5800.0, 23.0], [5700.0, 13.0], [6100.0, 13.0], [6000.0, 17.0], [5900.0, 12.0], [6200.0, 17.0], [6300.0, 16.0], [6500.0, 16.0], [6400.0, 15.0], [6600.0, 15.0], [6700.0, 19.0], [6900.0, 20.0], [6800.0, 15.0], [7000.0, 12.0], [7100.0, 13.0], [7400.0, 24.0], [7200.0, 16.0], [7300.0, 6.0], [7600.0, 15.0], [7500.0, 14.0], [7800.0, 30.0], [7900.0, 17.0], [7700.0, 18.0], [8000.0, 30.0], [8100.0, 30.0], [8200.0, 16.0], [8300.0, 25.0], [8400.0, 14.0], [8500.0, 21.0], [8700.0, 21.0], [8600.0, 14.0], [8800.0, 22.0], [8900.0, 15.0], [9000.0, 22.0], [9200.0, 20.0], [9100.0, 24.0], [9300.0, 18.0], [9500.0, 13.0], [9400.0, 13.0], [9700.0, 8.0], [9600.0, 13.0], [9800.0, 7.0], [10000.0, 6.0], [9900.0, 13.0], [10100.0, 11.0], [10200.0, 7.0], [10400.0, 3.0], [10500.0, 8.0], [10300.0, 9.0], [10700.0, 10.0], [10600.0, 8.0], [10800.0, 10.0], [11100.0, 7.0], [11200.0, 5.0], [10900.0, 8.0], [11000.0, 9.0], [11400.0, 8.0], [11300.0, 6.0], [11500.0, 10.0], [11600.0, 13.0], [11700.0, 6.0], [11900.0, 11.0], [11800.0, 4.0], [12000.0, 5.0], [12100.0, 8.0], [12200.0, 8.0], [12600.0, 17.0], [12700.0, 10.0], [12300.0, 7.0], [12400.0, 6.0], [12500.0, 16.0], [12800.0, 9.0], [13300.0, 14.0], [12900.0, 13.0], [13000.0, 8.0], [13100.0, 12.0], [13200.0, 12.0], [13400.0, 14.0], [13500.0, 13.0], [13600.0, 14.0], [13700.0, 16.0], [13800.0, 5.0], [14000.0, 13.0], [14100.0, 16.0], [14200.0, 22.0], [13900.0, 14.0], [14300.0, 15.0], [14500.0, 15.0], [14700.0, 23.0], [14800.0, 24.0], [14600.0, 19.0], [14400.0, 18.0], [15000.0, 23.0], [14900.0, 22.0], [15100.0, 15.0], [15200.0, 26.0], [15300.0, 9.0], [15400.0, 9.0], [15600.0, 9.0], [15800.0, 17.0], [15500.0, 25.0], [15700.0, 21.0], [16000.0, 13.0], [16200.0, 11.0], [15900.0, 18.0], [16100.0, 19.0], [16300.0, 9.0], [16600.0, 11.0], [16400.0, 12.0], [16800.0, 16.0], [17400.0, 18.0], [17200.0, 14.0], [17000.0, 15.0], [18200.0, 13.0], [17800.0, 23.0], [17600.0, 19.0], [18000.0, 15.0], [18400.0, 18.0], [18600.0, 14.0], [18800.0, 16.0], [19200.0, 17.0], [19000.0, 10.0], [19400.0, 12.0], [19600.0, 25.0], [19800.0, 19.0], [20200.0, 25.0], [20000.0, 19.0], [20400.0, 29.0], [20600.0, 35.0], [20800.0, 24.0], [21000.0, 6.0], [21200.0, 4.0], [21400.0, 2.0], [21600.0, 5.0], [21800.0, 1.0], [22200.0, 2.0], [22400.0, 1.0], [22600.0, 1.0], [16500.0, 21.0], [16700.0, 19.0], [16900.0, 12.0], [17100.0, 21.0], [17300.0, 29.0], [17500.0, 26.0], [18100.0, 21.0], [18300.0, 17.0], [17900.0, 19.0], [17700.0, 12.0], [18500.0, 20.0], [18900.0, 15.0], [19100.0, 8.0], [18700.0, 14.0], [19300.0, 19.0], [19900.0, 17.0], [19700.0, 32.0], [20300.0, 15.0], [19500.0, 22.0], [20100.0, 14.0], [20500.0, 50.0], [20700.0, 34.0], [21100.0, 5.0], [21300.0, 4.0], [20900.0, 10.0], [21500.0, 3.0], [22100.0, 1.0], [21900.0, 2.0], [21700.0, 3.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 22600.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 68.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2932.0, "series": [{"data": [[1.0, 68.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2932.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 330.04855842185106, "minX": 1.54961892E12, "maxY": 1381.2917556599737, "series": [{"data": [[1.54961892E12, 1381.2917556599737], [1.54961898E12, 330.04855842185106]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961898E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 685.5, "minX": 1.0, "maxY": 22248.0, "series": [{"data": [[2.0, 20698.0], [3.0, 20498.0], [4.0, 20538.0], [5.0, 20889.0], [6.0, 20611.0], [7.0, 20546.0], [8.0, 20471.0], [9.0, 20502.0], [10.0, 20573.0], [11.0, 20665.0], [12.0, 20483.0], [13.0, 20638.0], [14.0, 20599.0], [15.0, 20598.0], [17.0, 20466.5], [19.0, 20495.0], [20.0, 20510.0], [21.0, 20614.0], [22.0, 20874.0], [23.0, 20583.0], [24.0, 20689.0], [25.0, 20436.0], [26.0, 20476.0], [27.0, 20501.0], [28.0, 20731.0], [29.0, 20542.0], [30.0, 20504.0], [31.0, 20762.0], [33.0, 20849.0], [32.0, 20713.0], [35.0, 20978.0], [34.0, 20595.0], [37.0, 20686.0], [36.0, 20785.0], [39.0, 20540.0], [38.0, 21783.0], [41.0, 20831.0], [40.0, 20461.0], [43.0, 20622.0], [42.0, 20730.0], [45.0, 20782.0], [47.0, 20988.0], [46.0, 20627.0], [49.0, 20744.0], [50.0, 20386.0], [53.0, 20820.0], [52.0, 20524.0], [55.0, 20818.0], [54.0, 20610.0], [56.0, 20562.0], [59.0, 20655.0], [58.0, 20507.5], [61.0, 20804.0], [60.0, 20797.0], [63.0, 20655.0], [62.0, 21220.0], [67.0, 20590.0], [66.0, 20600.0], [65.0, 21504.0], [64.0, 20794.0], [71.0, 20487.0], [70.0, 20566.0], [69.0, 20544.0], [68.0, 20787.0], [75.0, 20362.0], [74.0, 20510.0], [73.0, 21620.0], [79.0, 21347.5], [77.0, 20564.0], [83.0, 21273.0], [82.0, 20772.0], [81.0, 20671.0], [80.0, 20938.0], [86.0, 20703.0], [85.0, 20390.0], [84.0, 20629.0], [91.0, 20728.0], [90.0, 20870.0], [89.0, 21785.0], [88.0, 21554.0], [95.0, 22248.0], [94.0, 20295.0], [93.0, 20854.0], [92.0, 20687.0], [99.0, 20547.0], [98.0, 20386.0], [97.0, 20541.0], [96.0, 20505.0], [103.0, 20924.0], [102.0, 20726.0], [101.0, 20389.0], [100.0, 21149.0], [106.0, 20450.0], [105.0, 20682.0], [104.0, 20416.0], [111.0, 21655.0], [110.0, 20703.0], [109.0, 20590.0], [108.0, 20648.5], [115.0, 21618.0], [114.0, 20588.0], [113.0, 20702.0], [112.0, 21612.0], [119.0, 20851.0], [118.0, 20284.0], [117.0, 20877.0], [116.0, 20628.0], [123.0, 20639.0], [122.0, 20556.0], [121.0, 20239.0], [120.0, 20683.0], [126.0, 7258.0], [127.0, 20351.0], [125.0, 20898.0], [124.0, 20469.0], [128.0, 5612.0], [134.0, 10493.0], [135.0, 20658.0], [133.0, 20664.0], [132.0, 20579.0], [130.0, 20637.0], [129.0, 20292.0], [137.0, 10817.0], [143.0, 20405.0], [142.0, 20626.0], [141.0, 20228.0], [140.0, 20326.0], [139.0, 22248.0], [138.0, 21032.0], [136.0, 20927.0], [146.0, 13877.333333333334], [145.0, 685.5], [150.0, 10551.0], [151.0, 20741.0], [149.0, 20755.0], [148.0, 20549.0], [147.0, 20587.0], [144.0, 20797.0], [152.0, 7830.0], [157.0, 10598.0], [156.0, 7292.333333333333], [159.0, 20774.0], [158.0, 20586.0], [155.0, 20718.0], [154.0, 21778.0], [153.0, 20985.0], [160.0, 10840.5], [167.0, 5839.0], [166.0, 20538.5], [164.0, 20584.0], [163.0, 20583.0], [162.0, 21171.0], [161.0, 20734.0], [168.0, 7358.333333333333], [173.0, 10736.0], [175.0, 10668.0], [174.0, 21576.0], [172.0, 22183.0], [171.0, 20578.0], [170.0, 21072.5], [182.0, 10765.5], [183.0, 20706.0], [181.0, 20317.0], [180.0, 21011.0], [179.0, 20821.0], [178.0, 20562.0], [177.0, 20448.0], [176.0, 20496.0], [187.0, 6066.25], [186.0, 7548.0], [190.0, 21283.0], [189.0, 20025.0], [188.0, 19738.0], [185.0, 20638.0], [184.0, 20299.0], [198.0, 7489.0], [197.0, 7231.0], [199.0, 20077.0], [196.0, 19540.0], [195.0, 19811.0], [194.0, 20905.5], [192.0, 20750.0], [205.0, 7278.333333333333], [207.0, 20114.0], [206.0, 21452.0], [204.0, 20214.0], [203.0, 19795.0], [202.0, 19765.0], [201.0, 19768.0], [200.0, 19939.0], [215.0, 7110.333333333333], [214.0, 21283.0], [213.0, 21475.0], [212.0, 19918.0], [211.0, 21519.0], [210.0, 19605.0], [209.0, 19775.0], [208.0, 19659.0], [218.0, 10471.5], [219.0, 1058.0], [221.0, 10668.5], [223.0, 7630.0], [222.0, 19712.0], [220.0, 19830.5], [217.0, 20012.0], [216.0, 19984.0], [224.0, 7362.333333333333], [226.0, 4816.4], [231.0, 19895.0], [230.0, 19374.0], [229.0, 19373.0], [228.0, 20214.0], [227.0, 20972.0], [225.0, 20350.0], [234.0, 10937.0], [235.0, 11178.0], [237.0, 10800.5], [239.0, 19833.0], [238.0, 19631.0], [236.0, 20305.0], [233.0, 19982.0], [232.0, 20993.0], [240.0, 10602.0], [243.0, 10844.0], [245.0, 10662.0], [247.0, 21340.0], [246.0, 19885.0], [244.0, 19508.0], [242.0, 20812.0], [241.0, 20013.0], [255.0, 19471.0], [254.0, 20272.0], [253.0, 19739.0], [252.0, 19791.0], [251.0, 19720.0], [250.0, 19761.0], [249.0, 20406.0], [248.0, 19713.0], [270.0, 19598.0], [258.0, 10977.5], [260.0, 10954.0], [261.0, 19759.0], [263.0, 20018.0], [257.0, 20156.0], [256.0, 19271.0], [262.0, 20145.0], [271.0, 19864.0], [269.0, 20222.0], [268.0, 19977.0], [259.0, 19780.0], [267.0, 20153.0], [266.0, 20262.0], [265.0, 20220.0], [264.0, 19815.0], [286.0, 11071.0], [280.0, 1407.5], [282.0, 10543.5], [287.0, 18876.0], [285.0, 19717.0], [284.0, 19321.0], [283.0, 19811.0], [281.0, 20428.5], [279.0, 21034.0], [273.0, 20862.0], [272.0, 20013.0], [275.0, 20760.0], [274.0, 19656.0], [278.0, 21107.0], [277.0, 21356.0], [276.0, 19597.0], [303.0, 10900.5], [298.0, 10962.0], [302.0, 20565.0], [301.0, 20886.0], [300.0, 21096.0], [291.0, 20879.0], [290.0, 19617.0], [289.0, 19302.0], [288.0, 21349.0], [299.0, 20621.0], [297.0, 20162.0], [296.0, 19499.0], [295.0, 19904.0], [294.0, 19621.0], [293.0, 19540.0], [292.0, 19967.0], [319.0, 20544.0], [309.0, 10419.5], [308.0, 20492.0], [310.0, 20635.0], [313.0, 7566.0], [318.0, 19703.0], [317.0, 20772.0], [316.0, 19440.0], [307.0, 19752.0], [306.0, 20169.0], [305.0, 20681.0], [304.0, 19461.0], [311.0, 20343.0], [315.0, 20146.0], [314.0, 19937.0], [312.0, 19659.0], [332.0, 10528.0], [322.0, 10612.5], [321.0, 11349.0], [320.0, 20840.0], [323.0, 10729.0], [326.0, 10626.0], [325.0, 20837.0], [324.0, 19443.0], [327.0, 19561.0], [335.0, 10718.0], [329.0, 19360.0], [328.0, 19727.0], [334.0, 19430.0], [333.0, 19885.0], [331.0, 19875.0], [330.0, 19253.0], [351.0, 19648.0], [341.0, 7716.333333333333], [340.0, 19572.0], [342.0, 19922.0], [345.0, 10829.0], [350.0, 20836.0], [349.0, 19272.0], [348.0, 20405.0], [339.0, 19753.0], [338.0, 19331.0], [337.0, 19614.0], [336.0, 20192.0], [343.0, 20158.0], [347.0, 20656.0], [346.0, 19555.0], [344.0, 20578.0], [366.0, 10532.0], [354.0, 7792.666666666667], [355.0, 10852.0], [356.0, 11256.0], [357.0, 19968.0], [359.0, 10747.5], [353.0, 19592.0], [352.0, 20733.0], [358.0, 20307.0], [367.0, 19108.0], [361.0, 19964.0], [360.0, 19535.0], [365.0, 20690.0], [364.0, 19298.0], [363.0, 19272.0], [362.0, 20403.0], [382.0, 19101.0], [383.0, 19882.0], [381.0, 20768.0], [380.0, 19492.0], [379.0, 19778.0], [378.0, 20081.0], [377.0, 18967.5], [375.0, 20006.0], [369.0, 19037.0], [368.0, 20691.0], [371.0, 19981.0], [370.0, 19826.0], [374.0, 19262.0], [373.0, 19209.0], [372.0, 19516.0], [399.0, 20237.0], [393.0, 10371.5], [398.0, 19694.0], [397.0, 20068.0], [396.0, 19131.0], [387.0, 20254.0], [386.0, 18974.0], [385.0, 19730.0], [384.0, 19494.0], [395.0, 20745.0], [394.0, 19233.0], [392.0, 19507.0], [391.0, 19201.0], [390.0, 20021.0], [389.0, 20246.0], [388.0, 19606.0], [414.0, 19372.0], [415.0, 18853.0], [413.0, 20170.0], [412.0, 19820.0], [411.0, 20463.0], [410.0, 18879.0], [409.0, 18981.0], [408.0, 19204.0], [407.0, 19898.0], [401.0, 20522.0], [400.0, 20259.0], [403.0, 19704.0], [402.0, 19591.0], [406.0, 19283.0], [405.0, 19523.0], [429.0, 19108.0], [431.0, 19687.0], [422.0, 10788.5], [421.0, 18728.0], [420.0, 19369.0], [427.0, 6419.0], [430.0, 20155.0], [428.0, 19785.0], [419.0, 19852.0], [418.0, 19106.0], [417.0, 19479.0], [416.0, 20017.0], [426.0, 19522.5], [425.0, 19058.0], [423.0, 18964.0], [447.0, 19672.0], [434.0, 1948.0], [439.0, 20222.0], [433.0, 19471.0], [432.0, 20111.0], [438.0, 18879.0], [437.0, 19540.0], [436.0, 19560.0], [441.0, 10971.0], [446.0, 19985.0], [445.0, 20217.0], [444.0, 19619.0], [435.0, 19501.5], [443.0, 18860.0], [442.0, 19837.0], [440.0, 18591.0], [461.0, 19577.0], [463.0, 18785.0], [457.0, 10435.0], [462.0, 19392.0], [460.0, 19031.0], [451.0, 18683.0], [450.0, 18574.0], [449.0, 19085.0], [448.0, 19387.0], [459.0, 18975.5], [456.0, 18637.0], [455.0, 19556.0], [454.0, 19735.0], [453.0, 19648.0], [452.0, 19329.0], [479.0, 10199.5], [465.0, 10728.0], [471.0, 19578.0], [464.0, 18635.0], [470.0, 19005.0], [469.0, 19727.0], [468.0, 18452.0], [475.0, 10503.5], [478.0, 19052.0], [477.0, 19385.0], [476.0, 18785.0], [467.0, 19712.0], [466.0, 19874.0], [474.0, 19283.0], [473.0, 18498.0], [472.0, 19062.0], [494.0, 18984.0], [487.0, 10861.0], [481.0, 18738.0], [480.0, 20135.0], [483.0, 19322.0], [482.0, 18430.0], [486.0, 18754.0], [485.0, 19340.0], [484.0, 18508.0], [495.0, 10072.0], [493.0, 19507.0], [492.0, 19515.0], [491.0, 18994.0], [490.0, 18316.0], [489.0, 19792.0], [488.0, 18989.0], [509.0, 10436.5], [497.0, 10278.0], [502.0, 10018.0], [501.0, 19738.0], [500.0, 18661.0], [503.0, 19344.0], [496.0, 18172.0], [506.0, 10505.0], [507.0, 10243.5], [508.0, 10178.0], [499.0, 18785.0], [498.0, 20369.0], [511.0, 19029.0], [510.0, 18065.0], [505.0, 19276.0], [504.0, 18848.0], [540.0, 18815.0], [538.0, 10122.5], [542.0, 18748.0], [536.0, 18614.0], [534.0, 18619.0], [532.0, 17932.0], [530.0, 18039.0], [528.0, 18183.0], [526.0, 18602.0], [514.0, 19086.0], [512.0, 19962.0], [518.0, 18970.0], [516.0, 18103.0], [524.0, 18124.0], [520.0, 17893.0], [572.0, 18550.0], [552.0, 10464.5], [554.0, 18131.0], [558.0, 17917.0], [546.0, 18729.0], [544.0, 17801.0], [550.0, 18268.0], [548.0, 17984.0], [556.0, 18122.0], [568.0, 2211.5], [574.0, 10066.5], [570.0, 17898.0], [566.0, 17857.0], [564.0, 18992.0], [562.0, 18546.0], [560.0, 18423.0], [602.0, 10501.5], [606.0, 18214.0], [592.0, 10293.0], [604.0, 17997.0], [600.0, 18439.0], [582.0, 18962.0], [580.0, 18196.0], [578.0, 17567.0], [576.0, 18041.0], [598.0, 18153.0], [596.0, 17380.0], [590.0, 19211.0], [588.0, 18088.0], [586.0, 18589.0], [584.0, 17898.0], [636.0, 10342.0], [620.0, 9992.5], [608.0, 10516.5], [614.0, 17874.0], [612.0, 18349.0], [610.0, 18734.0], [622.0, 17243.0], [616.0, 9500.0], [618.0, 17170.0], [638.0, 17352.0], [626.0, 17767.5], [624.0, 17568.0], [634.0, 18119.0], [632.0, 18636.0], [630.0, 18636.0], [628.0, 18239.0], [670.0, 18329.0], [642.0, 10254.0], [640.0, 17152.0], [644.0, 17129.0], [654.0, 17767.0], [652.0, 18530.0], [650.0, 17819.0], [648.0, 18141.5], [646.0, 7552.666666666667], [656.0, 7614.333333333333], [658.0, 17838.0], [660.0, 9884.5], [662.0, 10601.5], [668.0, 17075.0], [666.0, 18262.0], [664.0, 17592.5], [700.0, 16891.0], [672.0, 10064.5], [680.0, 9973.5], [682.0, 18354.0], [686.0, 18470.0], [684.0, 17967.0], [702.0, 17539.0], [698.0, 17604.0], [696.0, 18091.0], [678.0, 18545.0], [676.0, 18313.0], [674.0, 17911.0], [694.0, 17629.0], [692.0, 17575.0], [690.0, 17979.0], [688.0, 16820.0], [728.0, 16632.0], [734.0, 17669.0], [712.0, 9885.0], [714.0, 17589.0], [716.0, 17902.0], [718.0, 17298.0], [706.0, 17899.0], [704.0, 17772.0], [710.0, 17737.0], [708.0, 17555.0], [724.0, 10016.0], [726.0, 17597.0], [720.0, 17421.0], [722.0, 17640.0], [732.0, 17585.0], [730.0, 17417.0], [764.0, 10429.5], [758.0, 16904.0], [752.0, 17747.0], [754.0, 17013.0], [756.0, 16488.0], [766.0, 17560.0], [762.0, 17543.0], [760.0, 18187.0], [736.0, 17981.0], [738.0, 17771.0], [740.0, 17972.0], [742.0, 17386.0], [750.0, 17980.0], [748.0, 17624.0], [746.0, 17533.0], [744.0, 17288.0], [770.0, 10245.5], [774.0, 10086.5], [782.0, 17469.0], [772.0, 17376.0], [778.0, 17359.0], [776.0, 16316.0], [780.0, 10109.0], [784.0, 18149.0], [798.0, 16921.0], [796.0, 17174.0], [794.0, 17628.0], [792.0, 15754.0], [786.0, 7300.0], [788.0, 17240.0], [790.0, 16587.0], [800.0, 17847.0], [830.0, 17186.0], [804.0, 10128.0], [802.0, 16993.0], [814.0, 17014.0], [812.0, 16870.0], [810.0, 16026.0], [808.0, 16811.0], [824.0, 17321.0], [806.0, 17334.0], [820.0, 10116.5], [822.0, 16681.0], [816.0, 16721.0], [818.0, 17160.0], [828.0, 17111.0], [826.0, 17187.0], [860.0, 17100.0], [846.0, 8162.333333333333], [844.0, 7679.666666666667], [842.0, 4740.5], [840.0, 16642.0], [850.0, 3579.0], [852.0, 17026.0], [854.0, 16901.0], [862.0, 16709.0], [858.0, 16796.0], [856.0, 17219.0], [832.0, 17241.0], [834.0, 17369.0], [836.0, 16572.0], [838.0, 17138.0], [864.0, 10058.5], [892.0, 16441.0], [878.0, 16809.0], [876.0, 16709.0], [874.0, 16659.0], [872.0, 16368.0], [880.0, 16485.0], [882.0, 17344.0], [884.0, 16713.0], [894.0, 18013.0], [888.0, 16432.0], [870.0, 16966.0], [868.0, 16606.0], [866.0, 17049.0], [886.0, 16508.0], [898.0, 15928.0], [922.0, 15881.0], [926.0, 15837.0], [906.0, 10017.0], [904.0, 16137.0], [908.0, 16012.0], [902.0, 15872.0], [910.0, 16428.0], [920.0, 15944.0], [918.0, 9740.5], [912.0, 15506.0], [914.0, 16252.0], [916.0, 15726.0], [924.0, 16137.0], [958.0, 15505.0], [948.0, 9523.5], [946.0, 15660.0], [944.0, 15588.0], [950.0, 9454.0], [956.0, 17556.0], [954.0, 16107.0], [952.0, 15748.0], [934.0, 16826.0], [932.0, 15976.0], [930.0, 15978.0], [928.0, 15633.0], [942.0, 15916.0], [940.0, 16510.5], [938.0, 16618.0], [936.0, 16143.0], [962.0, 3180.5], [960.0, 16168.0], [966.0, 9362.0], [964.0, 16120.0], [968.0, 16002.0], [970.0, 17310.0], [974.0, 15838.0], [972.0, 16497.0], [978.0, 9356.5], [986.0, 7640.0], [984.0, 15757.0], [976.0, 15290.0], [990.0, 15224.0], [988.0, 9227.0], [982.0, 15920.0], [980.0, 15582.0], [1022.0, 7536.333333333334], [1020.0, 15785.0], [1002.0, 15245.0], [1006.0, 7434.666666666666], [1008.0, 14892.0], [1010.0, 15093.0], [1012.0, 15185.0], [1014.0, 16887.0], [1018.0, 15255.0], [1016.0, 14691.0], [992.0, 17216.0], [994.0, 15726.0], [996.0, 18600.0], [998.0, 15436.0], [1036.0, 15145.0], [1024.0, 7396.0], [1028.0, 15705.0], [1032.0, 15757.0], [1072.0, 14411.0], [1076.0, 14692.0], [1080.0, 14721.0], [1084.0, 16169.0], [1056.0, 14875.0], [1060.0, 15287.0], [1064.0, 7426.333333333334], [1068.0, 10137.0], [1044.0, 15018.0], [1040.0, 14801.0], [1048.0, 15045.0], [1052.0, 15263.0], [1092.0, 14828.0], [1136.0, 14527.0], [1144.0, 15778.0], [1104.0, 9128.0], [1108.0, 14750.0], [1088.0, 14756.0], [1096.0, 14293.0], [1100.0, 14767.0], [1116.0, 14892.0], [1112.0, 14620.0], [1120.0, 14761.0], [1128.0, 17402.0], [1148.0, 14707.0], [1140.0, 16358.0], [1208.0, 15931.0], [1184.0, 14822.0], [1188.0, 15008.0], [1192.0, 14152.0], [1212.0, 13798.0], [1204.0, 15117.0], [1200.0, 15963.0], [1152.0, 14227.0], [1156.0, 14467.0], [1160.0, 14261.0], [1164.0, 14164.0], [1180.0, 13971.0], [1176.0, 15424.0], [1172.0, 14128.0], [1168.0, 13979.0], [1196.0, 14179.0], [1272.0, 13582.0], [1248.0, 15431.0], [1252.0, 13716.0], [1256.0, 16178.0], [1276.0, 16022.0], [1268.0, 15816.0], [1264.0, 13173.0], [1244.0, 14882.0], [1216.0, 13628.0], [1220.0, 14103.0], [1224.0, 15740.5], [1228.0, 13541.0], [1240.0, 14887.0], [1236.0, 16476.0], [1232.0, 14932.0], [1260.0, 14840.0], [1340.0, 15395.0], [1320.0, 5486.454545454546], [1324.0, 5460.416666666666], [1316.0, 9517.0], [1332.0, 14847.0], [1336.0, 13151.0], [1312.0, 13191.0], [1328.0, 7097.5], [1292.0, 14206.0], [1288.0, 15705.0], [1284.0, 13290.0], [1280.0, 14561.0], [1308.0, 14655.0], [1304.0, 13027.0], [1300.0, 13796.0], [1296.0, 15768.0], [1352.0, 12905.0], [1356.0, 7601.0], [1344.0, 4477.0], [1372.0, 8788.0], [1368.0, 9878.0], [1364.0, 6656.6], [1348.0, 7250.666666666666], [1376.0, 7136.75], [1400.0, 12424.0], [1404.0, 14835.0], [1396.0, 10066.0], [1392.0, 7828.666666666666], [1388.0, 8915.5], [1384.0, 13441.0], [1380.0, 14792.0], [1360.0, 12785.0], [1408.0, 9025.0], [1412.0, 10062.5], [1436.0, 8995.0], [1432.0, 14557.0], [1424.0, 12755.0], [1428.0, 8278.666666666666], [1416.0, 12888.0], [1420.0, 11121.666666666666], [1444.0, 8239.666666666666], [1448.0, 13793.0], [1440.0, 13510.0], [1468.0, 9819.5], [1464.0, 14925.0], [1460.0, 12054.0], [1456.0, 9749.0], [1452.0, 13751.0], [1524.0, 12856.0], [1500.0, 8473.0], [1504.0, 9330.0], [1532.0, 10871.0], [1528.0, 10906.0], [1520.0, 13197.0], [1472.0, 14234.0], [1476.0, 13685.0], [1480.0, 14239.0], [1484.0, 13456.0], [1508.0, 9990.0], [1516.0, 8860.5], [1512.0, 11596.0], [1488.0, 7983.0], [1492.0, 12999.0], [1496.0, 14114.0], [1544.0, 9233.5], [1536.0, 10990.0], [1540.0, 10643.0], [1564.0, 11047.0], [1560.0, 12109.0], [1568.0, 10957.0], [1596.0, 6853.0], [1592.0, 11270.0], [1588.0, 7459.333333333333], [1584.0, 9015.5], [1548.0, 11641.0], [1572.0, 9230.5], [1576.0, 8430.0], [1580.0, 11519.0], [1552.0, 13470.0], [1556.0, 12885.0], [1604.0, 12117.0], [1648.0, 11244.0], [1656.0, 7834.5], [1612.0, 9242.5], [1600.0, 10359.0], [1608.0, 10128.0], [1624.0, 11086.0], [1620.0, 10071.0], [1616.0, 11714.0], [1628.0, 8795.0], [1636.0, 8346.5], [1632.0, 10369.0], [1640.0, 11811.0], [1644.0, 12880.0], [1660.0, 9576.0], [1652.0, 11471.0], [1668.0, 7388.666666666667], [1720.0, 8354.5], [1664.0, 11374.0], [1672.0, 11916.0], [1692.0, 9979.0], [1688.0, 10781.0], [1684.0, 11355.0], [1676.0, 7247.0], [1712.0, 10102.0], [1716.0, 10976.0], [1696.0, 8845.5], [1700.0, 11642.0], [1704.0, 10989.0], [1724.0, 9551.0], [1708.0, 10674.0], [1680.0, 8063.0], [1784.0, 9260.0], [1780.0, 8822.0], [1788.0, 8594.0], [1776.0, 11440.0], [1740.0, 8788.0], [1736.0, 8866.0], [1772.0, 7180.75], [1768.0, 8582.0], [1764.0, 7266.0], [1760.0, 7115.333333333333], [1744.0, 10195.0], [1748.0, 9074.0], [1752.0, 6755.0], [1756.0, 7426.0], [1728.0, 9092.0], [1804.0, 7253.0], [1852.0, 8665.0], [1800.0, 8282.0], [1796.0, 9050.5], [1792.0, 8319.0], [1820.0, 10861.0], [1840.0, 8970.0], [1844.0, 7026.0], [1824.0, 7834.0], [1848.0, 9097.0], [1808.0, 6939.0], [1816.0, 6962.666666666667], [1812.0, 7920.0], [1836.0, 7662.5], [1832.0, 7737.0], [1828.0, 8431.0], [1868.0, 7628.0], [1860.0, 8953.0], [1856.0, 8801.0], [1864.0, 9832.0], [1888.0, 9194.0], [1892.0, 7643.0], [1916.0, 9219.0], [1912.0, 8468.0], [1908.0, 9225.0], [1904.0, 8520.0], [1896.0, 9445.0], [1900.0, 8386.0], [1880.0, 7673.0], [1876.0, 9641.0], [1872.0, 7778.0], [1884.0, 8991.0], [1932.0, 8855.0], [1924.0, 7394.25], [1920.0, 8038.666666666667], [1948.0, 8499.0], [1972.0, 8708.0], [1976.0, 8722.0], [1980.0, 7996.0], [1968.0, 7930.0], [1952.0, 6924.75], [1956.0, 7763.0], [1960.0, 8833.0], [1964.0, 8207.0], [1936.0, 8970.0], [1940.0, 7444.5], [1944.0, 8604.0], [1992.0, 7482.0], [1984.0, 7594.5], [2008.0, 9271.0], [2012.0, 8049.0], [2004.0, 8258.0], [1988.0, 7752.5], [1996.0, 8468.0], [2032.0, 7702.0], [2036.0, 8220.0], [2040.0, 8181.0], [2044.0, 9106.0], [2016.0, 8780.5], [2020.0, 8554.5], [2024.0, 8274.0], [2028.0, 8290.0], [2000.0, 8163.0], [2048.0, 7296.0], [2056.0, 7733.333333333333], [2104.0, 7171.0], [2080.0, 8412.0], [2088.0, 8959.0], [2096.0, 6666.5], [2112.0, 8024.0], [2120.0, 7128.0], [2168.0, 6657.0], [2160.0, 7265.0], [2152.0, 7253.5], [2144.0, 7981.5], [2072.0, 8072.0], [2064.0, 7641.0], [2128.0, 7633.5], [2136.0, 6963.0], [2073.0, 8068.0], [2057.0, 7654.0], [2049.0, 8177.0], [2105.0, 7731.5], [2097.0, 7297.0], [2065.0, 7872.5], [2145.0, 8057.5], [2169.0, 8323.0], [2161.0, 7601.0], [2153.0, 8309.0], [2113.0, 8014.0], [2121.0, 8378.0], [2129.0, 8361.0], [2137.0, 7780.5], [2089.0, 7429.0], [2081.0, 8936.0], [1037.0, 15160.0], [1077.0, 9402.5], [1025.0, 9079.0], [1053.0, 14672.0], [1029.0, 9629.5], [1033.0, 16718.0], [1073.0, 14695.0], [1081.0, 14901.0], [1057.0, 14483.0], [1085.0, 7552.666666666667], [1061.0, 9056.0], [1065.0, 5303.142857142857], [1069.0, 14675.0], [1041.0, 14917.0], [1045.0, 7730.666666666666], [1049.0, 15238.0], [1117.0, 9120.0], [1105.0, 7485.666666666666], [1109.0, 9085.0], [1113.0, 15008.0], [1125.0, 10240.5], [1121.0, 14825.0], [1129.0, 15299.0], [1133.0, 15193.5], [1149.0, 14552.0], [1145.0, 16537.0], [1141.0, 14667.0], [1137.0, 14275.0], [1101.0, 15027.0], [1097.0, 17570.0], [1093.0, 14846.0], [1089.0, 14355.0], [1209.0, 15203.0], [1185.0, 14165.0], [1189.0, 14454.0], [1193.0, 16660.0], [1213.0, 14967.0], [1205.0, 16747.0], [1201.0, 13663.0], [1153.0, 14508.0], [1157.0, 14086.0], [1161.0, 17872.0], [1165.0, 14544.0], [1181.0, 14188.0], [1177.0, 16985.0], [1173.0, 13665.0], [1169.0, 15512.0], [1197.0, 14013.0], [1273.0, 15799.0], [1249.0, 14733.0], [1253.0, 13395.0], [1257.0, 14455.0], [1277.0, 14336.0], [1269.0, 13529.0], [1265.0, 14492.0], [1217.0, 15876.0], [1225.0, 13736.0], [1221.0, 14564.0], [1229.0, 13764.0], [1245.0, 13458.0], [1241.0, 13909.0], [1237.0, 13480.0], [1233.0, 14791.0], [1261.0, 16720.0], [1313.0, 13079.0], [1317.0, 6141.166666666667], [1321.0, 6623.8], [1325.0, 7709.333333333334], [1337.0, 12779.0], [1341.0, 6303.166666666666], [1329.0, 8313.0], [1293.0, 14822.0], [1289.0, 15888.0], [1285.0, 15255.0], [1281.0, 15285.0], [1309.0, 12845.0], [1305.0, 14285.0], [1301.0, 13057.0], [1297.0, 13226.0], [1333.0, 13364.0], [1349.0, 7073.75], [1369.0, 13612.0], [1373.0, 7150.75], [1365.0, 6652.0], [1345.0, 13304.0], [1353.0, 12803.0], [1405.0, 13377.0], [1397.0, 8289.333333333334], [1401.0, 14094.0], [1393.0, 9632.5], [1377.0, 7956.333333333334], [1381.0, 7379.666666666666], [1385.0, 8371.0], [1389.0, 8437.666666666666], [1361.0, 13712.0], [1409.0, 6300.0], [1413.0, 12551.0], [1437.0, 14380.0], [1433.0, 7973.666666666666], [1425.0, 13493.0], [1429.0, 7676.666666666666], [1417.0, 9044.5], [1421.0, 12938.0], [1461.0, 12321.0], [1457.0, 14066.0], [1465.0, 14960.0], [1441.0, 12015.0], [1469.0, 15066.0], [1445.0, 9345.0], [1449.0, 8305.0], [1453.0, 7309.0], [1477.0, 6074.0], [1473.0, 13151.0], [1501.0, 13361.0], [1497.0, 13481.0], [1481.0, 11923.0], [1521.0, 9434.0], [1485.0, 12192.0], [1529.0, 8289.0], [1525.0, 12255.0], [1533.0, 7122.0], [1505.0, 10954.0], [1509.0, 7402.333333333334], [1513.0, 12674.0], [1517.0, 9351.0], [1489.0, 7057.8], [1493.0, 12677.0], [1545.0, 11740.0], [1541.0, 6986.5], [1549.0, 8122.5], [1561.0, 9189.5], [1565.0, 8347.666666666666], [1537.0, 12963.0], [1589.0, 6701.166666666667], [1593.0, 10591.0], [1597.0, 10200.0], [1585.0, 8138.5], [1581.0, 10523.0], [1577.0, 12192.0], [1573.0, 10612.0], [1569.0, 11087.0], [1557.0, 7534.333333333334], [1553.0, 11938.0], [1613.0, 10295.0], [1601.0, 11527.0], [1605.0, 11526.0], [1629.0, 12265.0], [1649.0, 10010.0], [1609.0, 11260.0], [1653.0, 11842.0], [1661.0, 8509.5], [1657.0, 9847.0], [1621.0, 7392.666666666667], [1617.0, 10614.0], [1625.0, 8038.5], [1641.0, 12166.0], [1637.0, 11540.0], [1633.0, 11972.0], [1645.0, 12076.0], [1713.0, 9181.0], [1665.0, 8373.0], [1705.0, 8223.5], [1701.0, 9368.0], [1697.0, 9382.0], [1709.0, 11562.0], [1673.0, 9903.0], [1669.0, 12645.0], [1677.0, 10772.0], [1717.0, 9301.0], [1693.0, 10578.0], [1689.0, 10862.0], [1685.0, 11685.0], [1681.0, 11664.0], [1725.0, 9952.0], [1721.0, 11118.0], [1737.0, 8455.0], [1753.0, 8413.5], [1729.0, 7015.25], [1733.0, 10281.5], [1741.0, 11104.0], [1777.0, 8610.0], [1789.0, 8563.0], [1781.0, 9565.0], [1761.0, 7530.5], [1765.0, 8161.0], [1773.0, 8407.5], [1769.0, 8440.0], [1749.0, 7577.0], [1745.0, 10221.0], [1757.0, 7020.333333333333], [1805.0, 7678.5], [1797.0, 8506.0], [1793.0, 8321.0], [1801.0, 9665.0], [1821.0, 10888.0], [1841.0, 8374.0], [1825.0, 9889.0], [1853.0, 9738.0], [1849.0, 7878.0], [1845.0, 7917.0], [1809.0, 9340.0], [1817.0, 7317.666666666667], [1813.0, 8565.0], [1833.0, 7680.0], [1837.0, 9163.0], [1829.0, 9938.0], [1865.0, 8989.0], [1861.0, 7472.0], [1885.0, 7782.333333333333], [1857.0, 8976.0], [1869.0, 7327.0], [1889.0, 7834.0], [1893.0, 8468.0], [1917.0, 9190.0], [1913.0, 7509.0], [1909.0, 8097.0], [1905.0, 9272.0], [1897.0, 7487.0], [1901.0, 7804.5], [1877.0, 8643.0], [1873.0, 10553.0], [1881.0, 8100.5], [1929.0, 8473.5], [1945.0, 7684.0], [1921.0, 9163.0], [1949.0, 8858.0], [1933.0, 8179.0], [1925.0, 9020.0], [1969.0, 7359.5], [1973.0, 8743.0], [1977.0, 7896.0], [1981.0, 8685.0], [1953.0, 8021.5], [1961.0, 9640.0], [1957.0, 8806.0], [1965.0, 8242.0], [1937.0, 7288.0], [1941.0, 9883.0], [1989.0, 7959.5], [1993.0, 8183.5], [1985.0, 8365.0], [2013.0, 7666.0], [2009.0, 7262.0], [2005.0, 7679.5], [1997.0, 9312.0], [2033.0, 8903.0], [2037.0, 7396.666666666667], [2041.0, 8148.0], [2045.0, 9481.0], [2017.0, 7824.0], [2021.0, 7462.0], [2025.0, 9056.0], [2029.0, 7946.0], [2001.0, 7830.0], [2050.0, 8161.0], [2146.0, 7050.5], [2106.0, 7970.0], [2098.0, 7184.0], [2058.0, 7579.5], [2082.0, 7775.0], [2090.0, 8381.0], [2114.0, 7328.75], [2162.0, 8048.0], [2170.0, 7829.0], [2154.0, 6474.5], [2074.0, 7955.0], [2066.0, 8750.0], [2122.0, 7393.5], [2130.0, 7539.666666666667], [2138.0, 7855.0], [2067.0, 8119.0], [2075.0, 7410.333333333333], [2051.0, 8123.0], [2107.0, 7205.0], [2099.0, 7843.0], [2059.0, 8215.0], [2147.0, 7831.0], [2171.0, 7390.0], [2163.0, 7646.0], [2155.0, 7892.0], [2115.0, 7812.0], [2123.0, 8057.0], [2131.0, 7466.5], [2139.0, 7981.0], [2091.0, 7854.5], [2083.0, 8704.0], [543.0, 17752.0], [527.0, 2262.0], [525.0, 18424.0], [523.0, 18751.5], [521.0, 18380.0], [531.0, 10260.5], [539.0, 10508.0], [541.0, 18530.0], [537.0, 19006.0], [519.0, 18027.0], [517.0, 18883.0], [515.0, 19288.0], [513.0, 18530.0], [535.0, 18114.0], [533.0, 18326.0], [529.0, 18036.0], [573.0, 18460.0], [545.0, 10193.0], [547.0, 17977.0], [551.0, 18673.0], [549.0, 18380.0], [559.0, 18319.0], [557.0, 18851.0], [555.0, 19302.0], [553.0, 18387.0], [575.0, 17723.0], [571.0, 18259.0], [569.0, 18207.0], [567.0, 18879.0], [565.0, 18613.0], [563.0, 19224.0], [561.0, 18437.0], [607.0, 18010.0], [583.0, 10004.0], [581.0, 10668.5], [579.0, 17858.0], [577.0, 18050.0], [591.0, 18456.0], [589.0, 19105.0], [587.0, 17550.0], [585.0, 17835.0], [595.0, 12801.333333333334], [593.0, 18629.0], [601.0, 10352.0], [605.0, 18753.0], [603.0, 18701.0], [599.0, 17523.0], [597.0, 18366.0], [633.0, 18439.0], [637.0, 10534.0], [619.0, 10052.5], [617.0, 18209.0], [639.0, 18244.0], [635.0, 18523.0], [631.0, 16970.0], [629.0, 17858.0], [623.0, 17266.0], [611.0, 17870.0], [609.0, 18591.0], [615.0, 17577.0], [613.0, 18105.0], [621.0, 17612.0], [669.0, 17068.0], [645.0, 10336.5], [643.0, 10254.0], [641.0, 17158.0], [655.0, 18302.0], [653.0, 18484.0], [651.0, 17659.0], [649.0, 17330.0], [647.0, 2344.0], [671.0, 18382.0], [657.0, 17076.0], [667.0, 19181.0], [665.0, 18287.0], [661.0, 18481.0], [659.0, 18027.0], [701.0, 9573.5], [675.0, 10292.5], [673.0, 17234.0], [679.0, 18006.0], [677.0, 17344.0], [687.0, 17526.0], [685.0, 17464.0], [683.0, 17148.0], [681.0, 18161.0], [695.0, 7746.0], [703.0, 17562.0], [699.0, 17452.0], [697.0, 17434.0], [693.0, 18150.0], [691.0, 18231.0], [689.0, 17686.0], [729.0, 18063.0], [715.0, 17644.0], [713.0, 18043.0], [717.0, 17856.0], [719.0, 17799.0], [707.0, 17338.0], [705.0, 17324.0], [711.0, 17155.0], [709.0, 18127.0], [725.0, 10400.0], [727.0, 16447.0], [735.0, 17678.0], [721.0, 17589.0], [723.0, 17073.0], [733.0, 17601.0], [731.0, 16718.0], [765.0, 7712.0], [757.0, 9958.5], [759.0, 10280.0], [763.0, 10380.0], [767.0, 17504.0], [753.0, 17256.0], [755.0, 16672.0], [761.0, 17185.0], [751.0, 17853.0], [737.0, 17713.0], [739.0, 17587.0], [741.0, 18342.0], [743.0, 17469.0], [749.0, 17629.0], [747.0, 16527.0], [745.0, 17367.0], [771.0, 17101.0], [769.0, 12620.333333333334], [783.0, 16738.0], [781.0, 16892.0], [773.0, 8190.666666666667], [779.0, 10137.5], [777.0, 17842.0], [785.0, 9517.0], [799.0, 10117.0], [797.0, 17472.0], [795.0, 16940.0], [793.0, 17362.0], [775.0, 17498.0], [787.0, 10018.0], [789.0, 16306.0], [791.0, 10121.0], [801.0, 17617.0], [825.0, 10405.0], [815.0, 16700.0], [803.0, 17604.0], [813.0, 16911.0], [811.0, 17424.0], [809.0, 17154.0], [807.0, 17071.0], [805.0, 17314.0], [821.0, 8187.333333333333], [823.0, 16788.0], [831.0, 16647.0], [817.0, 17395.0], [819.0, 16877.0], [829.0, 16830.0], [827.0, 17043.0], [861.0, 18968.0], [857.0, 17039.0], [845.0, 10163.5], [843.0, 7039.75], [841.0, 7719.333333333333], [849.0, 17022.0], [851.0, 16768.5], [853.0, 17162.0], [855.0, 16551.0], [863.0, 16785.0], [859.0, 16823.0], [847.0, 17066.0], [833.0, 16891.0], [835.0, 16836.0], [837.0, 17423.0], [839.0, 17182.0], [891.0, 16019.0], [879.0, 16259.0], [877.0, 17572.0], [875.0, 16759.0], [873.0, 16438.0], [895.0, 9986.5], [881.0, 16409.0], [883.0, 16374.0], [885.0, 16589.0], [893.0, 16076.0], [889.0, 17353.0], [871.0, 16982.0], [869.0, 16305.0], [867.0, 17384.0], [865.0, 16946.0], [887.0, 16560.0], [911.0, 16599.0], [905.0, 16295.0], [907.0, 16274.0], [909.0, 16079.0], [897.0, 15715.0], [901.0, 16050.5], [899.0, 16397.0], [903.0, 16193.0], [921.0, 15894.0], [919.0, 9784.5], [927.0, 15597.0], [913.0, 17839.0], [915.0, 16562.0], [917.0, 16876.0], [925.0, 16679.0], [923.0, 15622.0], [959.0, 15532.0], [955.0, 15680.0], [947.0, 9659.0], [945.0, 16026.0], [949.0, 15525.0], [951.0, 9536.5], [957.0, 16171.0], [953.0, 15707.0], [935.0, 15920.0], [933.0, 15927.0], [931.0, 15747.0], [929.0, 16148.0], [943.0, 15556.0], [941.0, 18677.0], [937.0, 17650.0], [963.0, 11580.666666666666], [987.0, 7387.0], [961.0, 15324.0], [965.0, 15558.0], [967.0, 6589.75], [969.0, 6543.5], [971.0, 9561.0], [975.0, 8742.5], [973.0, 15535.0], [985.0, 15788.0], [989.0, 9618.5], [991.0, 9383.0], [977.0, 15713.0], [983.0, 9590.5], [981.0, 15576.0], [979.0, 15077.0], [1021.0, 9007.0], [1005.0, 11564.666666666666], [1003.0, 15206.0], [1001.0, 15170.5], [1023.0, 6684.75], [1009.0, 15019.0], [1011.0, 15035.0], [1013.0, 15831.0], [1015.0, 15538.0], [1019.0, 16756.0], [1017.0, 15561.0], [1007.0, 15868.0], [993.0, 15553.0], [995.0, 16041.0], [997.0, 15205.0], [999.0, 18293.0], [1078.0, 14768.0], [1086.0, 6282.25], [1026.0, 15487.0], [1030.0, 15534.0], [1034.0, 15163.0], [1038.0, 9020.0], [1074.0, 9392.5], [1082.0, 14559.0], [1058.0, 8932.0], [1062.0, 16524.0], [1070.0, 14877.0], [1066.0, 7611.333333333333], [1046.0, 7397.333333333334], [1042.0, 15190.0], [1050.0, 15427.0], [1054.0, 15278.0], [1090.0, 14994.0], [1106.0, 17537.0], [1110.0, 6267.5], [1118.0, 9127.5], [1098.0, 15037.0], [1102.0, 16173.0], [1114.0, 14713.0], [1138.0, 14157.0], [1150.0, 14312.0], [1122.0, 15992.0], [1126.0, 14561.0], [1134.0, 14806.0], [1130.0, 15773.0], [1146.0, 14396.0], [1142.0, 17197.0], [1210.0, 13767.0], [1214.0, 15014.0], [1186.0, 16890.0], [1190.0, 14865.0], [1194.0, 16510.0], [1206.0, 13702.0], [1202.0, 14050.0], [1182.0, 15375.0], [1154.0, 15736.0], [1158.0, 15693.0], [1162.0, 14422.0], [1166.0, 13752.0], [1178.0, 14257.0], [1174.0, 14049.0], [1170.0, 14427.0], [1198.0, 14118.0], [1274.0, 16047.0], [1278.0, 13223.0], [1250.0, 13587.0], [1254.0, 16155.0], [1258.0, 15563.0], [1270.0, 14470.0], [1266.0, 14460.0], [1218.0, 16135.0], [1222.0, 15225.0], [1226.0, 14853.0], [1230.0, 13807.0], [1242.0, 13676.0], [1238.0, 15106.0], [1234.0, 15007.0], [1262.0, 14728.0], [1342.0, 7350.5], [1326.0, 7745.333333333334], [1322.0, 7195.0], [1318.0, 5880.625], [1330.0, 5814.0], [1334.0, 9530.0], [1338.0, 9007.0], [1314.0, 14316.0], [1294.0, 15663.0], [1290.0, 13344.0], [1286.0, 14327.0], [1282.0, 13481.0], [1310.0, 13023.0], [1306.0, 14246.0], [1302.0, 14260.0], [1298.0, 14787.0], [1350.0, 10319.5], [1374.0, 7437.0], [1346.0, 14985.0], [1370.0, 8263.666666666666], [1366.0, 10202.5], [1354.0, 14890.0], [1406.0, 8366.0], [1398.0, 10725.5], [1402.0, 14863.0], [1394.0, 6975.25], [1358.0, 15671.5], [1378.0, 7532.0], [1386.0, 13180.0], [1382.0, 12643.0], [1390.0, 13559.0], [1362.0, 9009.5], [1414.0, 9183.0], [1410.0, 7372.0], [1438.0, 8385.666666666666], [1430.0, 9204.5], [1434.0, 9734.5], [1426.0, 6909.0], [1418.0, 15430.0], [1446.0, 11784.0], [1470.0, 13913.0], [1442.0, 13431.0], [1466.0, 9957.0], [1422.0, 12841.0], [1458.0, 8043.333333333334], [1450.0, 8968.0], [1454.0, 9037.0], [1526.0, 12458.0], [1506.0, 6630.6], [1534.0, 13069.0], [1530.0, 11670.0], [1522.0, 12542.0], [1502.0, 11315.0], [1474.0, 12512.0], [1478.0, 14178.0], [1482.0, 12406.0], [1486.0, 12164.0], [1514.0, 13143.0], [1518.0, 12639.0], [1510.0, 8151.5], [1490.0, 9545.0], [1494.0, 7664.333333333334], [1498.0, 13166.0], [1546.0, 8765.5], [1538.0, 7056.25], [1566.0, 10792.0], [1562.0, 12679.0], [1542.0, 6902.75], [1570.0, 8272.5], [1598.0, 8017.0], [1594.0, 8064.0], [1590.0, 8991.5], [1586.0, 8633.0], [1550.0, 12939.0], [1574.0, 7223.25], [1578.0, 6953.25], [1582.0, 13369.0], [1554.0, 8849.5], [1558.0, 9257.0], [1602.0, 11592.0], [1614.0, 12281.0], [1630.0, 10222.0], [1606.0, 10065.0], [1610.0, 10170.0], [1650.0, 10810.0], [1662.0, 8811.0], [1626.0, 8367.5], [1622.0, 12314.0], [1618.0, 12296.0], [1638.0, 9949.0], [1642.0, 11614.0], [1646.0, 9749.0], [1658.0, 12739.0], [1654.0, 10787.0], [1670.0, 10022.0], [1674.0, 8151.0], [1666.0, 10567.0], [1694.0, 11662.0], [1690.0, 11664.0], [1686.0, 9412.0], [1678.0, 10792.0], [1714.0, 9371.0], [1718.0, 9085.0], [1698.0, 10375.0], [1702.0, 11103.0], [1726.0, 10165.0], [1722.0, 9519.0], [1706.0, 6926.666666666667], [1710.0, 7695.0], [1682.0, 8323.0], [1782.0, 8746.0], [1730.0, 8588.0], [1786.0, 8882.5], [1778.0, 8316.0], [1742.0, 8760.0], [1738.0, 9974.0], [1734.0, 8889.0], [1790.0, 8123.5], [1770.0, 9428.0], [1766.0, 10572.0], [1774.0, 10713.0], [1762.0, 9083.0], [1746.0, 7515.0], [1750.0, 9156.0], [1754.0, 8996.0], [1758.0, 10742.0], [1806.0, 9467.0], [1798.0, 8052.0], [1794.0, 8691.0], [1802.0, 9287.0], [1822.0, 9440.0], [1818.0, 8184.0], [1842.0, 9218.0], [1854.0, 9204.0], [1850.0, 9670.0], [1846.0, 9337.0], [1810.0, 7074.666666666667], [1814.0, 8102.0], [1826.0, 7684.5], [1834.0, 7306.0], [1838.0, 8207.0], [1830.0, 9106.0], [1870.0, 9389.0], [1866.0, 9165.0], [1862.0, 7840.0], [1858.0, 9400.0], [1886.0, 7158.0], [1890.0, 8801.0], [1918.0, 9130.0], [1910.0, 8377.0], [1906.0, 9268.0], [1914.0, 9030.0], [1894.0, 6984.0], [1898.0, 8796.0], [1902.0, 9351.0], [1878.0, 8770.0], [1874.0, 10440.0], [1882.0, 7916.5], [1934.0, 8983.0], [1970.0, 7712.5], [1922.0, 7390.0], [1946.0, 8342.0], [1950.0, 8891.0], [1930.0, 8326.0], [1926.0, 8847.0], [1974.0, 8538.0], [1978.0, 8709.0], [1982.0, 8407.5], [1954.0, 8092.0], [1962.0, 7712.0], [1958.0, 8770.0], [1966.0, 7868.0], [1938.0, 7739.5], [1942.0, 7677.5], [1990.0, 8501.0], [1986.0, 7177.5], [2014.0, 8316.0], [2010.0, 8400.0], [2006.0, 8985.0], [1994.0, 8015.0], [1998.0, 9264.0], [2034.0, 7894.0], [2038.0, 7691.5], [2042.0, 7419.0], [2046.0, 8597.5], [2018.0, 7515.0], [2022.0, 8367.5], [2030.0, 9252.0], [2002.0, 7533.5], [2148.0, 6897.0], [2060.0, 7955.5], [2052.0, 9024.0], [2108.0, 6735.0], [2100.0, 7833.0], [2084.0, 7834.0], [2116.0, 8031.0], [2164.0, 6481.0], [2172.0, 7885.0], [2156.0, 8080.0], [2076.0, 8060.0], [2068.0, 8753.0], [2124.0, 8052.0], [2132.0, 7177.5], [2140.0, 7753.0], [2061.0, 7179.75], [2053.0, 8116.0], [2109.0, 7971.0], [2101.0, 7210.5], [2077.0, 7126.0], [2149.0, 7333.666666666667], [2165.0, 6649.0], [2157.0, 7748.0], [2117.0, 8120.0], [2173.0, 7758.0], [2125.0, 7800.333333333333], [2133.0, 7672.0], [2141.0, 7635.0], [2085.0, 8638.0], [2093.0, 7859.0], [1035.0, 14720.0], [1027.0, 14979.0], [1055.0, 16381.0], [1031.0, 10169.5], [1039.0, 15220.0], [1075.0, 15260.0], [1083.0, 9437.0], [1079.0, 16315.0], [1087.0, 6636.75], [1059.0, 15535.0], [1063.0, 15237.0], [1067.0, 9221.0], [1071.0, 14656.0], [1043.0, 8998.0], [1047.0, 7793.666666666667], [1051.0, 10040.5], [1147.0, 13982.0], [1119.0, 8930.0], [1107.0, 16134.0], [1115.0, 14214.0], [1111.0, 14683.0], [1123.0, 15886.0], [1127.0, 15857.0], [1131.0, 14031.0], [1135.0, 14189.0], [1151.0, 14510.0], [1143.0, 13960.0], [1139.0, 14796.0], [1103.0, 14362.0], [1099.0, 15029.0], [1095.0, 15535.0], [1091.0, 14635.0], [1211.0, 15065.0], [1215.0, 16209.0], [1187.0, 14269.0], [1191.0, 14986.0], [1195.0, 13736.0], [1207.0, 16714.0], [1203.0, 14325.0], [1183.0, 13696.0], [1155.0, 14444.0], [1159.0, 17876.0], [1163.0, 14083.0], [1167.0, 14296.0], [1179.0, 13982.0], [1175.0, 13650.0], [1171.0, 15685.0], [1199.0, 14059.0], [1275.0, 16020.0], [1279.0, 13282.0], [1251.0, 14609.0], [1255.0, 13965.0], [1259.0, 16150.0], [1271.0, 13591.0], [1267.0, 14521.0], [1247.0, 13714.0], [1219.0, 14986.0], [1231.0, 13688.0], [1243.0, 13485.0], [1239.0, 14294.0], [1235.0, 14045.0], [1263.0, 12999.0], [1315.0, 9992.5], [1339.0, 9612.5], [1323.0, 5593.555555555556], [1327.0, 9520.0], [1319.0, 5997.25], [1335.0, 10076.0], [1343.0, 7580.0], [1295.0, 14678.0], [1291.0, 15915.0], [1287.0, 13505.0], [1283.0, 14484.0], [1311.0, 14409.0], [1307.0, 12999.0], [1303.0, 16553.0], [1299.0, 14973.0], [1331.0, 15518.0], [1347.0, 9432.5], [1371.0, 6118.0], [1367.0, 9105.5], [1375.0, 13673.0], [1355.0, 8933.0], [1351.0, 12790.0], [1359.0, 8849.5], [1407.0, 8348.333333333334], [1403.0, 10358.0], [1399.0, 13249.0], [1395.0, 7490.25], [1379.0, 9353.5], [1383.0, 8446.5], [1391.0, 8383.333333333334], [1387.0, 7469.0], [1363.0, 8837.5], [1411.0, 9127.5], [1423.0, 7773.0], [1439.0, 6875.0], [1435.0, 12394.0], [1427.0, 10188.0], [1431.0, 13910.0], [1415.0, 9783.5], [1463.0, 8647.4], [1459.0, 12963.0], [1467.0, 14257.0], [1471.0, 14216.0], [1443.0, 12208.0], [1447.0, 13815.0], [1451.0, 9356.5], [1455.0, 15064.0], [1479.0, 14250.0], [1483.0, 9527.5], [1495.0, 7801.666666666666], [1503.0, 11036.0], [1499.0, 12721.0], [1475.0, 10225.5], [1487.0, 13440.0], [1523.0, 9078.0], [1527.0, 10893.0], [1531.0, 8661.5], [1535.0, 13622.0], [1507.0, 13323.0], [1511.0, 7040.25], [1515.0, 7511.0], [1519.0, 10979.0], [1491.0, 12236.0], [1547.0, 11766.0], [1595.0, 11160.0], [1543.0, 12509.0], [1551.0, 12773.0], [1563.0, 12456.0], [1567.0, 11471.0], [1539.0, 13577.0], [1599.0, 8689.0], [1591.0, 9047.0], [1587.0, 11175.0], [1583.0, 7932.0], [1579.0, 10839.0], [1575.0, 12209.0], [1571.0, 11696.0], [1555.0, 12551.0], [1559.0, 9299.0], [1607.0, 8621.0], [1655.0, 8263.0], [1603.0, 7975.5], [1631.0, 9960.0], [1627.0, 12235.0], [1651.0, 7074.25], [1615.0, 11079.0], [1611.0, 12336.0], [1659.0, 11363.0], [1619.0, 10240.0], [1623.0, 11038.0], [1643.0, 9184.5], [1639.0, 10142.0], [1635.0, 10503.0], [1647.0, 9979.0], [1723.0, 11371.0], [1667.0, 9396.0], [1727.0, 7976.5], [1703.0, 11584.0], [1699.0, 9529.0], [1707.0, 9293.0], [1711.0, 10261.0], [1675.0, 8206.0], [1671.0, 10954.0], [1679.0, 9725.0], [1715.0, 9641.0], [1695.0, 7632.5], [1691.0, 9580.0], [1687.0, 10488.0], [1683.0, 11606.0], [1719.0, 10685.0], [1743.0, 10131.0], [1779.0, 7203.0], [1735.0, 11236.0], [1731.0, 9000.0], [1739.0, 9991.0], [1787.0, 8572.0], [1783.0, 9392.0], [1791.0, 9442.0], [1763.0, 7990.5], [1775.0, 8373.0], [1771.0, 8730.5], [1767.0, 8760.0], [1747.0, 9034.0], [1751.0, 8984.0], [1755.0, 9967.0], [1759.0, 8778.0], [1807.0, 9680.0], [1799.0, 8562.0], [1803.0, 9094.0], [1823.0, 8014.0], [1819.0, 9371.0], [1843.0, 8888.0], [1855.0, 9286.0], [1851.0, 8233.0], [1847.0, 10081.0], [1815.0, 8546.0], [1811.0, 9011.0], [1835.0, 7786.0], [1839.0, 8237.0], [1831.0, 9601.0], [1827.0, 9111.0], [1867.0, 8723.0], [1871.0, 7053.0], [1859.0, 8097.0], [1887.0, 7587.0], [1863.0, 9493.0], [1891.0, 6895.0], [1911.0, 7521.0], [1907.0, 9143.0], [1915.0, 7651.333333333333], [1895.0, 7442.0], [1899.0, 7981.0], [1903.0, 8444.0], [1875.0, 9149.0], [1883.0, 7798.0], [1931.0, 7851.0], [1947.0, 7478.333333333333], [1951.0, 7772.5], [1923.0, 6329.0], [1935.0, 7021.0], [1927.0, 9064.0], [1975.0, 8453.0], [1971.0, 9629.0], [1979.0, 8237.0], [1983.0, 8655.0], [1955.0, 8843.0], [1959.0, 8791.0], [1963.0, 7333.0], [1939.0, 7999.5], [1943.0, 8505.0], [1987.0, 7111.5], [2011.0, 6977.5], [2007.0, 8133.0], [2003.0, 8277.0], [1991.0, 8166.0], [1995.0, 8188.5], [1999.0, 7828.0], [2035.0, 7846.0], [2039.0, 7905.5], [2043.0, 7788.0], [2047.0, 9202.0], [2023.0, 8157.0], [2027.0, 8816.0], [2031.0, 9076.0], [2019.0, 7733.5], [2150.0, 7262.666666666667], [2054.0, 8048.0], [2110.0, 8318.0], [2102.0, 7262.0], [2086.0, 7735.0], [2094.0, 7957.0], [2118.0, 8106.0], [2166.0, 7693.5], [2174.0, 7795.0], [2158.0, 8057.0], [2078.0, 7955.0], [2070.0, 7959.5], [2062.0, 8099.0], [2126.0, 7888.0], [2134.0, 7933.0], [2142.0, 6901.0], [2071.0, 9267.0], [2063.0, 7303.0], [2055.0, 7805.0], [2111.0, 7686.0], [2103.0, 7762.5], [2095.0, 6972.0], [2151.0, 7832.666666666667], [2167.0, 7664.0], [2159.0, 7713.0], [2175.0, 7437.0], [2119.0, 7811.0], [2127.0, 7431.0], [2135.0, 7334.666666666667], [2143.0, 7711.0], [2087.0, 8853.0], [1.0, 20565.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1150.368666666666, 12091.269666666654]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2175.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 4140.716666666666, "minX": 1.54961892E12, "maxY": 16423.233333333334, "series": [{"data": [[1.54961892E12, 16423.233333333334], [1.54961898E12, 4623.316666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961892E12, 14709.283333333333], [1.54961898E12, 4140.716666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961898E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 9950.200768902176, "minX": 1.54961892E12, "maxY": 19697.100151745068, "series": [{"data": [[1.54961892E12, 9950.200768902176], [1.54961898E12, 19697.100151745068]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961898E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 9950.19478855191, "minX": 1.54961892E12, "maxY": 19697.095599393047, "series": [{"data": [[1.54961892E12, 9950.19478855191], [1.54961898E12, 19697.095599393047]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961898E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 0.43854324734446126, "minX": 1.54961892E12, "maxY": 63.27851345578818, "series": [{"data": [[1.54961892E12, 63.27851345578818], [1.54961898E12, 0.43854324734446126]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961898E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 615.0, "minX": 1.54961892E12, "maxY": 22620.0, "series": [{"data": [[1.54961892E12, 19181.0], [1.54961898E12, 22620.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961892E12, 615.0], [1.54961898E12, 16970.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961892E12, 16601.4], [1.54961898E12, 19976.100000000002]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961892E12, 18156.379999999997], [1.54961898E12, 21170.89]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961892E12, 17368.8], [1.54961898E12, 20586.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961898E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 9181.0, "minX": 10.0, "maxY": 19811.0, "series": [{"data": [[39.0, 9181.0], [10.0, 19811.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 39.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 9181.0, "minX": 10.0, "maxY": 19811.0, "series": [{"data": [[39.0, 9181.0], [10.0, 19811.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 39.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 50.0, "minX": 1.54961892E12, "maxY": 50.0, "series": [{"data": [[1.54961892E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961892E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 10.983333333333333, "minX": 1.54961892E12, "maxY": 39.016666666666666, "series": [{"data": [[1.54961892E12, 39.016666666666666], [1.54961898E12, 10.983333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961898E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 10.983333333333333, "minX": 1.54961892E12, "maxY": 39.016666666666666, "series": [{"data": [[1.54961892E12, 39.016666666666666], [1.54961898E12, 10.983333333333333]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961898E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
